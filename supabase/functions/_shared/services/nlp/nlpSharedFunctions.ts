const config = require("../../config");
const ReposPlugin = require("../repos/reposE2BPlugin");
const constants = require("../../constants");

// NOTE: need to re-run executables if you update functions here!!! (see note in /executables file(s) if so)
class NLPSharedFunctions {
  constructor(parent, admin) {
    // Store the reference to the parent class
    this.parent = parent;
    this.admin = admin;
    this.reposPlugin = new ReposPlugin();
    this.nlpFunctions = { // TODO: maybe move these into separate parts of the codebase to not clog up this file (eg. as subfiles within the nlp folder, eg. one for feedback, one for repos,...)
      // Each function should return: {result: RESULTING_STRING_HERE, data: ANY_DATA_TO_PASS_BACK_HERE, references: OPTIONAL_REFERENCES_HERE}
      predictProductBeingReferenced: async ({predictedProductName}) => {
        try {
          console.log(`predictProductBeingReferenced called with predictedProductName: ${predictedProductName}`);
          if (predictedProductName == "unknown") {
            predictedProductName = null; // don't want to assign predictedProductName if we don't know it
          }
          return {
            result: "Success",
            data: predictedProductName,
          };
        } catch (error) {
          console.log(`Error trying to run predictProductBeingReferenced: ${error}`);
          return {
            result: `Error trying to run predictProductBeingReferenced: ${error}`,
          };
        }
      },
      searchAppReviews: async ({appName, platformNames, queryText}) => {
        try {
          console.log(`searchAppReviews called with queryText: ${queryText} and appName: ${appName} and platformNames: ${platformNames}`);
          await this.ensureOrganisationDataRetrieved(this.parent.organisationId);
          this.parent.supportedProductNames = this.parent.organisationData.productNames;
          if (this.parent.supportedProductNames && this.parent.supportedProductNames.length > 0) {
            this.parent.defaultProductName = this.parent.supportedProductNames[0]; // TODO: improve this so not just using first in list but instead what member selects or perhaps what they last asked about
          }
          await this.ensureMemberDataRetrieved(this.parent.memberFire);
          if (this.parent.organisationData && this.parent.organisationData.organisationPlatformTokens) {
            this.parent.supportedPlatformNames = this.parent.supportedPlatformNames.concat(Object.keys(this.parent.organisationData.organisationPlatformTokens));
          }
          if (this.parent.memberData && this.parent.memberData.memberPlatformTokens) {
            this.parent.supportedPlatformNames = this.parent.supportedPlatformNames.concat(Object.keys(this.parent.memberData.memberPlatformTokens));
          }

          if (!appName && this.parent.defaultProductName) {
            appName = this.parent.defaultProductName; // If not specified, search the default one
          }
          if (!platformNames) {
            platformNames = this.parent.supportedPlatformNames; // If none specified, search all of them
          }
          const appReviewsList = await this.parent.storagePlugin.searchAppReviews(this.parent, this.parent.organisationId, appName, platformNames, queryText);
          console.log(`appReviewsList: ${JSON.stringify(appReviewsList)}`);
          const appReviewIDsList = appReviewsList.map((item) => item.docId);
          const reviewsUrlRef = `https://app.getathenic.com/#/app/feedback?appname=${encodeURIComponent(appName)}&reviewids=${encodeURIComponent(appReviewIDsList)}`;
          return {
            result: "Success",
            data: appReviewsList,
            references: reviewsUrlRef,
          };
        } catch (error) {
          console.log(`searchAppReviews() failed with error: ${error}`);
        }
      },
      setupReport: async ({reportCadence, namesOfPlatformSourcesRequestedByMember, queryText}) => {
        console.log(`setupReport called with...\nreportCadence: ${reportCadence}\nnamesOfPlatformSourcesRequestedByMember: ${namesOfPlatformSourcesRequestedByMember}\nqueryText: ${queryText}`);
        try {
          // TODO: report back to member context, eg. what platforms are currently enabled which will be searched, or maybe a warning if they setup a report referencing a platform they havent setup yet
          const reportId = Math.floor(Date.now() / 10); // epoch in centiseconds
          const docData = {
            reports: {
              [reportCadence]: {
                [reportId]: {
                  "enabled": true,
                  "platformSources": namesOfPlatformSourcesRequestedByMember,
                  "request": queryText,
                  "sourceOrganisationId": this.parent.organisationId,
                  "sourceThreadId": this.parent.threadId,
                  "lastModified": admin.firestore.Timestamp.fromDate(new Date()),
                },
              },
            },
          };
          const updateDocRes = await this.parent.storagePlugin.updateDoc(`members/${this.parent.memberFire}`, docData); // TODO: tell AI if request has been successful
          if (updateDocRes) {
            return {"result": "Successfully stored report"};
          } else {
            return {"result": "Failed to create report entry in database. Please try again."};
          }
        } catch (error) {
          console.log(`setupReport() failed with error: ${error}`);
          return {"result": `Failed to create report due to error: ${error}`};
        }
      },
      createTicket: async (ticketData) => {
        console.log(`createTicket called with ticketData: ${JSON.stringify(ticketData)}`);
        try {
          await this.ensureOrganisationDataRetrieved(this.parent.organisationId);
          if (this.parent.memberFire) {
            await this.ensureMemberDataRetrieved(this.parent.memberFire);
          }

          let athenicProjectId;
          if (this.parent.memberData && this.parent.memberData.memberPlatformTokens && this.parent.memberData.memberPlatformTokens.atlassian && this.parent.memberData.memberPlatformTokens.atlassian.curProject && this.parent.memberData.memberPlatformTokens.atlassian.curProject.id) {
            athenicProjectId = this.parent.memberData.memberPlatformTokens.atlassian.curProject.id;
          } else if (this.parent.selectedProductName) {
            const projectDocToUse = await this.parent.storagePlugin.getProductProjectDocs({organisationId: this.parent.organisationId, productName: this.parent.selectedProductName, getAll: false, includeUnknown: 1});
            athenicProjectId = projectDocToUse.id;
          }
          if (athenicProjectId) {
            const projectIdToUse = athenicProjectId.replace("atlassian-", ""); // Extract atlassian label from project ID
            const createTicketRes = await this.parent.tasksService.createTicket(this.parent.organisationId, this.parent.organisationData, projectIdToUse, ticketData);
            console.log(`createTicketRes: ${JSON.stringify(createTicketRes)}`);
            return createTicketRes; // Already in {result:XXX,data:YYY,references:ZZZ} format
          } else {
            console.error("Can't find project ID");
            return {"result": "Couldn't create ticket (unable to find project ID). Try reconnecting Atlassian in the Connections tab."};
          }
        } catch (error) {
          console.log(`createTicket() failed with error: ${error}`);
        }
      },
      analyseExtProject: async (feedbackDataFromMember) => {
        try {
          console.log(`analyseExtProject called with feedbackDataFromMember: ${JSON.stringify(feedbackDataFromMember)} and type: ${typeof feedbackDataFromMember}`);
          if (typeof feedbackDataFromMember == this.getParamTypeFormat("STRING")) {
            console.log(`For some reason it's returned the object as a string, so trying to parse: ${feedbackDataFromMember}`);
            feedbackDataFromMember = JSON.parse(feedbackDataFromMember);
          }
          return {
            result: "Success",
            data: feedbackDataFromMember,
          };
        } catch (error) {
          console.log(`Error trying to analyseExtProject: ${error}`);
          return {
            result: `Error trying to analyseExtProject: ${error}`,
          };
        }
      },
      analyseProductReview: async (feedbackDataFromMember) => {
        try {
          console.log(`analyseProductReview called with feedbackDataFromMember: ${JSON.stringify(feedbackDataFromMember)} and type: ${typeof feedbackDataFromMember}`);
          if (typeof feedbackDataFromMember == this.getParamTypeFormat("STRING")) {
            console.log(`For some reason it's returned the object as a string, so trying to parse: ${feedbackDataFromMember}`);
            feedbackDataFromMember = JSON.parse(feedbackDataFromMember);
          }
          return {
            result: "Success",
            data: feedbackDataFromMember,
          };
        } catch (error) {
          console.log(`Error trying to analyseProductReview: ${error}`);
          return {
            result: `Error trying to analyseProductReview: ${error}`,
          };
        }
      },
      extractUserData: async ({category, dataIfFeedbackFromUser, dataIfUncategorised}) => {
        try {
          console.log(`extractUserData called with category: ${category} and dataIfFeedbackFromUser: ${dataIfFeedbackFromUser} and dataIfUncategorised: ${dataIfUncategorised}`);
          if (category == "data_from_user") {
            await this.ensureOrganisationDataRetrieved(this.parent.organisationId);

            if (typeof dataIfFeedbackFromUser == this.getParamTypeFormat("STRING")) {
              console.log(`For some reason it's returned the object as a string, so trying to parse: ${dataIfFeedbackFromUser}`);
              dataIfFeedbackFromUser = JSON.parse(dataIfFeedbackFromUser);
            }
            console.log(`dataIfFeedbackFromUser: ${dataIfFeedbackFromUser}`);
            console.log(`JSON dataIfFeedbackFromUser: ${JSON.stringify(dataIfFeedbackFromUser)}`);
            console.log(`type dataIfFeedbackFromUser: ${typeof dataIfFeedbackFromUser}`);

            const docId = `${this.parent.selectedPlatformName}-${Math.floor(Date.now() / 10)}`; // epoch in centiseconds
            const docData = {
              "comments": {
                "memberComment": {
                  "text": dataIfFeedbackFromUser.userFeedback,
                  "likelyQuestions": dataIfFeedbackFromUser.likelyQuestions,
                  "relatedProductAreas": dataIfFeedbackFromUser.relatedProductAreas,
                  "feedbackTypes": dataIfFeedbackFromUser.feedbackTypes,
                  "estimatedUserAdoptionStage": dataIfFeedbackFromUser.estimatedUserAdoptionStage,
                  "estimatedNPS": dataIfFeedbackFromUser.estimatedNPS,
                  "userLifetimeValue": dataIfFeedbackFromUser.userLifetimeValue,
                },
              },
              "dataSource": this.parent.selectedPlatformName,
            };
            if (!this.parent.organisationData.userDataAnonymous) {
              docData.authorName = dataIfFeedbackFromUser.userName;
            }
            if (dataIfFeedbackFromUser.userCommentTimestamp) {
              console.log(`dataIfFeedbackFromUser.userCommentTimestamp: ${dataIfFeedbackFromUser.userCommentTimestamp}`);
              docData["comments"]["memberComment"]["lastModified"] = this.admin.firestore.Timestamp.fromDate(new Date(Date.parse(dataIfFeedbackFromUser.userCommentTimestamp)));
            }
            if (this.parent.selectedProductName) {
              console.log(`docData: ${JSON.stringify(docData)}`);
              console.log(`this.parent.processingDryRun: ${this.parent.processingDryRun}`);
              if (this.parent.processingDryRun == constants.TriBool.TRUE) {
                return {
                  data: docData,
                  result: "Successfully extracted data",
                };
              } else {
                const docDataWithEmbedding = await this.parent.addEmbeddingToObject(docData);
                const docPath = `organisations/${this.parent.organisationId}/products/${this.parent.selectedProductName}/feedback/${docId}`;
                console.log(`docPath: ${docPath}`);
                await this.parent.storagePlugin.updateDoc(docPath, docDataWithEmbedding); // TODO: tell AI if save has been successful. // Doing this outside of relatedTasks batch commit as that is more risky of going wrong due to wrong model data whilst this is more important

                if (docDataWithEmbedding.comments["memberComment"] && docDataWithEmbedding.comments["memberComment"].feedbackTypes && docDataWithEmbedding.comments["memberComment"].feedbackTypes.length > 0) {
                  // User comment not empty and they requested change(s)
                  await this.parent.tasksPlugin.updateTasksFromUserFeedback({feedbackData: docData, relatedTaskIDs: dataIfFeedbackFromUser.relatedTaskIDs, nlpGeminiPlugin: this.parent, organisationId: this.parent.organisationId, organisationData: this.parent.organisationData, productName: this.parent.selectedProductName, tasksMap: this.parent.tasksMap});
                }

                return {
                  data: docData,
                  result: "Successfully extracted data",
                };
              }
            } else {
              console.log("Error: extractUserData function failed as could not get this.parent.selectedProductName");
              return {
                result: "Error: extractUserData function failed as could not get this.parent.selectedProductName",
              };
            }
          } else if (category == "uncategorised") {
            if (typeof dataIfUncategorised == this.getParamTypeFormat("STRING")) {
              console.log(`For some reason it's returned the object as a string, so trying to parse: ${dataIfUncategorised}`);
              dataIfUncategorised = JSON.parse(dataIfUncategorised);
            }
            console.log(`dataIfUncategorised: ${JSON.stringify(dataIfUncategorised)}`);
            const docId = `${this.parent.selectedPlatformName}-${Math.floor(Date.now() / 10)}`; // platform-epoch in centiseconds
            let docData = dataIfUncategorised;
            docData.dataSource = this.parent.selectedPlatformName;
            try {
              for (const singleMessage of docData["messageThread"]) {
                singleMessage.sendTime = this.admin.firestore.Timestamp.fromDate(new Date(Date.parse(singleMessage.sendTime)));
              }
            } catch (error) {
              console.log(`Couldn't parse date strings: ${error}`);
            }
            console.log(`this.parent.processingDryRun: ${this.parent.processingDryRun}`);
            if (this.parent.processingDryRun == constants.TriBool.TRUE) {
              return {
                data: docData,
                result: "Successfully extracted data",
              };
            } else {
              docData = await this.parent.addEmbeddingToObject(dataIfUncategorised);
              console.log(`docData: ${JSON.stringify(docData)}`);
              const docPath = `organisations/${this.parent.organisationId}/uncategorisedData/${docId}`;
              console.log(`docPath: ${docPath}`);
              await this.parent.storagePlugin.updateDoc(docPath, docData); // TODO: tell AI if save has been successful
              return {
                data: docData,
                result: "Successfully extracted message and saved to database",
              };
            }
          } else {
            console.log(`Error: extractUserData function could not find category: ${category}`);
            return {
              result: `Error: extractUserData function could not find category: ${category}`,
            };
          }
        } catch (error) {
          console.log(`Error trying to extractUserData: ${error}. May be due to the function predicting one category but then providing data assuming the other category (consider improving this code to avoid this issue)`);
          return {
            result: `Error trying to extractUserData: ${error}. May be due to the function predicting one category but then providing data assuming the other category (consider improving this code to avoid this issue)`,
          };
        }
      },
      updateTask: async (updatedTaskData) => {
        try {
          console.log(`updateTask called with updatedTaskData: ${JSON.stringify(updatedTaskData)} and type: ${typeof updatedTaskData}`);
          if (typeof updatedTaskData == this.getParamTypeFormat("STRING")) {
            console.log(`For some reason it's returned the object as a string, so trying to parse: ${updatedTaskData}`);
            updatedTaskData = JSON.parse(updatedTaskData);
          }
          return {
            result: "Success",
            data: updatedTaskData,
          };
        } catch (error) {
          console.log(`Error trying to updateTask: ${error}`);
          return {
            result: `Error trying to updateTask: ${error}`,
          };
        }
      },
      createNotification: async (notificationData) => {
        try {
          console.log(`createNotification called with notificationData: ${JSON.stringify(notificationData)} and type: ${typeof notificationData}`);
          if (typeof notificationData == this.getParamTypeFormat("STRING")) {
            console.log(`For some reason it's returned the object as a string, so trying to parse: ${notificationData}`);
            notificationData = JSON.parse(notificationData);
          }
          return {
            result: "Success",
            data: notificationData,
          };
        } catch (error) {
          console.log(`Error trying to process notificationData: ${error}`);
          return {
            result: `Error trying to process notificationData: ${error}`,
          };
        }
      },

      // Function to create a directory
      createDirectoryInRepository: async ({path}) => {
        try {
          console.log(`[Sandbox] 🔄 Running createDirectoryInRepository\nDirectory: ${path}`);
          await config.sandbox.files.makeDir(path);
          return {
            result: "Success",
          };
        } catch (error) {
          console.log(`Error creating directory: ${error}`);
          return {
            result: `Error creating directory: ${error}`,
          };
        }
      },

      // Function to create/replace content of a file
      createOrReplaceFileInRepository: async ({path, content}) => {
        try {
          console.log(`[Sandbox] 🔄 Running createOrReplaceFileInRepository\nPath: ${path}\nContent: ${content}`);
          const dir = path.split("/").slice(0, -1).join("/");
          await config.sandbox.files.makeDir(dir);
          await config.sandbox.files.write(path, content);
          return {
            result: "Success",
          };
        } catch (error) {
          console.log(`Error creating/replacing file: ${error}`);
          return {
            result: `Error creating/replacing file: ${error}`,
          };
        }
      },

      // Function to save content to a file
      modifyFileInRepository: async ({path, startLine, endLine, newContent}) => {
        try {
          console.log(`[Sandbox] 🔄 Running modifyFileInRepository\nPath: ${path}\nStartLine: ${startLine}\nEndLine: ${endLine}\nNew Content: ${newContent}`);

          // Read the existing content of the file
          const existingContent = await config.sandbox.files.read(path);
          const lines = existingContent.split("\n");

          // Replace lines from startLine to endLine with newContent (split by lines)
          const newContentLines = newContent.split("\n");
          const modifiedLines = [
            ...lines.slice(0, startLine),
            ...newContentLines,
            ...lines.slice(endLine + 1),
          ];

          // Join the modified lines into a single string and write it back to the file
          const modifiedContent = modifiedLines.join("\n");
          await config.sandbox.files.write(path, modifiedContent);

          return {
            result: "Success",
          };
        } catch (error) {
          console.log(`Error modifying file lines: ${error}`);
          return {
            result: `Error modifying file lines: ${error}`,
          };
        }
      },

      // Function to list files in a directory
      listFilesInRepository: async ({path}) => {
        try {
          console.log(`[Sandbox] 🔄 Running listFilesInRepository\nDirectory: ${path}`);
          const files = await config.sandbox.files.list(path);
          console.log(`listFilesInRepository raw: ${files}`);
          const response = files
              .map((file) => (file.isDir ? `dir: ${file.name}` : file.name))
              .join("\n");
          console.log(`listFilesInRepository response: ${response}`);
          return {
            result: "Success",
            data: response,
          };
        } catch (error) {
          console.log(`Error listing files: ${error}`);
          return {
            result: `Error listing files: ${error}`,
          };
        }
      },

      // Function to read a file
      readFileInRepository: async ({path}) => {
        try {
          console.log(`[Sandbox] 🔄 Running readFileInRepository\nPath: ${path}`);
          const fileContent = await config.sandbox.files.read(path);
          return {
            result: "Success",
            data: fileContent, // TODO: consider whether un-minimising the code helps AI readability or not
          };
        } catch (error) {
          console.log(`Error reading file: ${error}`);
          return {
            result: `Error reading file: ${error}`,
          };
        }
      },

      // Function to commit changes to a Git repo
      commitToRepository: async ({message}) => {
        try {
          message = this.escapeString(message);
          console.log(`[Sandbox] 🔄 Running commitToRepository\nMessage: ${message}`);
          const gitAddProc = await this.reposPlugin.run({command: `git -C ${constants.REPO_DIRECTORY} add .`});
          if (gitAddProc.exitCode !== 0) {
            const error = `Error adding files: ${gitAddProc.stdout}\n${gitAddProc.stderr}`;
            console.log(`Error: ${error}`);
            return {result: `Error: ${error}`};
          }

          const gitCommitProc = await this.reposPlugin.run({command: `git -C ${constants.REPO_DIRECTORY} commit -m ${message}`});
          if (gitCommitProc.exitCode !== 0) {
            const error = `Error committing: ${gitCommitProc.stdout}\n${gitCommitProc.stderr}`;
            console.log(`Error: ${error}`);
            return {result: `Error: ${error}`};
          }

          return {result: "Success"};
        } catch (error) {
          console.log(`Error committing: ${error}`);
          return {result: `Error committing: ${error}`};
        }
      },

      // Function to create a pull request
      makePullRequestToRepository: async ({title}) => {
        const baseBranch = "main";
        const randomLetters = Math.random().toString(36).substring(2, 7);
        const newBranchName = `ai-developer-${randomLetters}`;

        try {
          console.log(`[Sandbox] 🔄 Running makePullRequestToRepository\nBranch: ${newBranchName}`);
          title = this.escapeString(title);
          const gitCheckoutProc = await this.reposPlugin.run({command: `git -C ${constants.REPO_DIRECTORY} checkout -b ${newBranchName}`});
          if (gitCheckoutProc.exitCode !== 0) {
            const error = `Error creating new branch: ${gitCheckoutProc.stdout}\n${gitCheckoutProc.stderr}`;
            console.log(`Error: ${error}`);
            return {result: `Error: ${error}`};
          }

          console.log(`Pushing new branch: ${newBranchName}`);
          const gitPushProc = await this.reposPlugin.run({command: `git -C ${constants.REPO_DIRECTORY} push -u origin ${newBranchName}`});
          if (gitPushProc.exitCode !== 0) {
            const error = `Error pushing changes: ${gitPushProc.stdout}\n${gitPushProc.stderr}`;
            console.log(`Error: ${error}`);
            return {result: `Error: ${error}`};
          }

          console.log(`Creating pull request from ${newBranchName} to ${baseBranch}`);
          const ghPullRequestProc = await this.reposPlugin.run({command: `(cd ${constants.REPO_DIRECTORY} && gh pr create --base "${baseBranch}" --head "${newBranchName}" --title ${title} --body "")`}); // needed to add cd command as before that orig code trying to work not in repo directory. In brackets so it doesnt stay in this directory
          if (ghPullRequestProc.exitCode !== 0) {
            const error = `Error creating pull request: ${ghPullRequestProc.stdout}\n${ghPullRequestProc.stderr}`;
            console.log(`Error: ${error}`);
            return {result: `Error: ${error}`};
          }

          return {result: "Success"};
        } catch (error) {
          console.log(`Error making pull request: ${error}`);
          return {result: `Error making pull request: ${error}`};
        }
      },
    };
  }

  async ensureAdminSettingsRetrieved() {
    if (!this.parent.adminSettings) {
      // This presumes we are happy to assume that by the time the Firebase Function has completed, we havent saved org data (without updating it here) and then wanted to retrieve that updated data
      const adminSettingsDoc = await this.parent.storagePlugin.getDoc("admin/settings");
      this.parent.adminSettings = adminSettingsDoc.data();
    }
  }

  async ensureOrganisationDataRetrieved(organisationId) {
    if (!this.parent.organisationData) {
      // This presumes we are happy to assume that by the time the Firebase Function has completed, we havent saved org data (without updating it here) and then wanted to retrieve that updated data
      const organisationDoc = await this.parent.storagePlugin.getDoc(`organisations/${organisationId}`);
      this.parent.organisationData = organisationDoc.data();
    }
  }

  async ensureMemberDataRetrieved(memberFire) {
    if (!this.parent.memberData) {
      // This presumes we are happy to assume that by the time the Firebase Function has completed, we havent saved member data (without updating it here) and then wanted to retrieve that updated data
      const memberDoc = await this.parent.storagePlugin.getDoc(`members/${memberFire}`);
      this.parent.memberData = memberDoc.data();
    }
  }

  async ensureProductDataAllRetrieved(organisationId) {
    if (!this.parent.productDataAll) {
      // This presumes we are happy to assume that by the time the Firebase Function has completed, we havent saved org product data (without updating it here) and then wanted to retrieve that updated data
      const productsSnapshot = await this.parent.storagePlugin.getColDocs(`organisations/${organisationId}/products`, {});
      productsSnapshot.forEach((doc) => { // Reminder: can't use any awaits in here if you need to wait for them before future code
        const productData = doc.data();
        this.parent.productDataAll[doc.id] = productData;
      });
    }
  }

  getParamTypeFormat(type) {
    // Converts between Google's upper-case types and OpenAI's lower-case types
    if (this.parent && this.parent.selectedNlp == "gemini") {
      return type.toUpperCase(); // Gemini uses types like 'STRING', 'OBJECT', etc.
    } else {
      return type.toLowerCase(); // OpenAI uses types like 'string', 'object', etc. (also use this if called from /executables where parent is null)
    }
  }

  addToFunctionDeclarations(curFunctionDeclarations, newFunction) {
    console.log(`Adding function: ${JSON.stringify(newFunction)}`);
    if (this.parent && this.parent.selectedNlp == "gemini") {
      curFunctionDeclarations.push(newFunction);
      return curFunctionDeclarations; // Gemini doesn't want any surrounding map
    } else {
      newFunction.parameters.additionalProperties = false; // OpenAI needs this too (also use this if called from /executables where parent is null)
      curFunctionDeclarations.push({
        "type": "function",
        "function": newFunction,
      });
      return curFunctionDeclarations; // OpenAI needs this surrounding map
    }
  }

  async getFunctionDeclarations(limitedFunctionSupportList) {
    // Note: Gemini schema defined here: https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/function-calling#schema
    // Note: Ensure functions you want to support are added to wherever nlp is initialised. If limitedFunctionSupportList is null, it means we want to support all functions. If it's [], means you dont want to support any.
    // TODO: add support for Structured Outputs (strict=true) across all functions if called by openai
    console.log(`getFunctionDeclarations called with limitedFunctionSupportList: ${limitedFunctionSupportList}`);
    let functionDeclarations = [];

    // If may use any feedback-related function, define the data we'll need for it
    if (!limitedFunctionSupportList || limitedFunctionSupportList.includes("analyseProductReview") || limitedFunctionSupportList.includes("extractUserData")) {
      await this.ensureAdminSettingsRetrieved();
      const defaultProductAreasKeyList = Object.keys(this.parent.adminSettings.defaultProductAreas);
      const taskTypesKeyList = Object.keys(this.parent.adminSettings.taskTypes);
      const userAdoptionStagesKeyList = Object.keys(this.parent.adminSettings.userAdoptionStages);

      let tasksDataDescriptions = "";
      const tasksIDs = [];
      if (this.parent.selectedProductName) { // If we know what product the feedback is referring to
        // Find projects associated with the product
        const associatedProjects = await this.parent.storagePlugin.getProductProjectDocs({organisationId: this.parent.organisationId, productName: this.parent.selectedProductName});
        for (const projectDoc of associatedProjects) {
          console.log(`Found project with correct related product: ${projectDoc.id}`);

          const projectTaskColPath = `organisations/${this.parent.organisationId}/projects/${projectDoc.id}/tasks`;
          console.log(`projectTaskColPath: ${projectTaskColPath}`);
          // Get existing tasks docs for a given project
          const projectTasksSnapshot = await this.parent.storagePlugin.getColDocs(projectTaskColPath, {});
          console.log(`productTasksSnapshot: ${projectTasksSnapshot}`);
          // Process each task doc
          projectTasksSnapshot.forEach((doc) => { // Reminder: can't use any awaits in here if you need to wait for them before future code
            const projectTaskData = doc.data();
            tasksDataDescriptions += `\n ${projectTaskData.taskId}: The problem is ${projectTaskData.problem}. The potential soluton is ${projectTaskData.suggestedSolution}`; // Just add the main items to not overcomplicate the data being sent to the model
            tasksIDs.push(projectTaskData.taskId);
            this.parent.tasksMap.taskId = projectTaskData;
          });
        }
      }
      console.log(`tasksDataDescriptions: ${tasksDataDescriptions}`);
      console.log(`tasksIDs: ${JSON.stringify(tasksIDs)}`);

      let dataIfFeedbackFromUserDescription;
      const dataIfFeedbackFromUserRequiredFields = ["likelyQuestions", "relatedProductAreas", "feedbackTypes"];
      dataIfFeedbackFromUserDescription = "";
      if (!limitedFunctionSupportList || limitedFunctionSupportList.includes("extractUserData")) {
        dataIfFeedbackFromUserDescription += "If overarching purpose of the message is the user providing feedback: "; // rest will be added below
        dataIfFeedbackFromUserRequiredFields.push("userFeedback");
      }
      dataIfFeedbackFromUserDescription += "\nExtract the user feedback data. Bear in mind that users are providing feedback on a product, and we as the product team want to view the analysis of this feedback and create tasks based on the feedback to solve the users' problems by improving the product. The data returned must be a valid JSON object.";
      await this.ensureOrganisationDataRetrieved(this.parent.organisationId);
      if (this.parent.organisationData.userDataAnonymous) {
        dataIfFeedbackFromUserDescription += "\nEnsure identifiable personal user information is anonymised! E.g. it is ok to include their company name, their device name,... but anything that coould be personally identifiable, like their own name or username, should be anonymised.";
      }
      this.parent.dataIfFeedbackFromUser = {
        type: this.getParamTypeFormat("OBJECT"),
        description: dataIfFeedbackFromUserDescription,
        properties: {
          likelyQuestions: {
            type: this.getParamTypeFormat("ARRAY"),
            description: "Array of no more than five of the most likely questions an organisation user who is querying data and likely cares about this data might ask (for the benefit of improving the data's embedding for the AI model).",
            items: {
              type: this.getParamTypeFormat("STRING"),
              description: "A single question a user might ask",
            },
          },
          relatedProductAreas: {
            type: this.getParamTypeFormat("ARRAY"),
            description: `Array of any product areas related to the user's feedback, considering the following descriptions: ${JSON.stringify(this.parent.adminSettings.defaultProductAreas)}`,
            items: {
              type: this.getParamTypeFormat("STRING"),
              description: "An area of the product",
              enum: defaultProductAreasKeyList,
            },
          },
          relatedTaskIDs: {
            type: this.getParamTypeFormat("ARRAY"),
            description: `Given any problems provided by the user, identify any existing product tasks that would fix the problems raised. Do this by listing the IDs of these task(s). Here are the details of the product tasks that can be chosen from: ${tasksDataDescriptions}.`,
            items: {
              type: this.getParamTypeFormat("STRING"),
              description: "A task ID",
              enum: tasksIDs,
            },
          },
          feedbackTypes: {
            type: this.getParamTypeFormat("ARRAY"),
            description: `Within the user's message about the product, if they haven't requested any changes, leave this array empty, otherwise, if they have requested any changes, list which, if any, of the following types of product feedback were mentioned, considering the following descriptions: ${JSON.stringify(this.parent.adminSettings.taskTypes)}`,
            items: {
              type: this.getParamTypeFormat("STRING"),
              description: "A category of user feedback",
              enum: taskTypesKeyList,
            },
          },
          estimatedUserAdoptionStage: {
            type: this.getParamTypeFormat("STRING"),
            description: `If it makes sense and is possible, estimate which stage of the product adoption cycle the user is likely in, considering the following descriptions: ${JSON.stringify(this.parent.adminSettings.userAdoptionStages)}`,
            enum: userAdoptionStagesKeyList,
          },
          estimatedNPS: {
            type: this.getParamTypeFormat("INTEGER"),
            description: "If it makes sense and is possible, estimate the Net Promoter Score (NPS) of the user based on their feedback. This is a value based on the question: 'How likely is it, from a 0-10 inclusive scale, that you'd recommend this product to a friend or colleague?'.",
          },
          userLifetimeValue: {
            type: this.getParamTypeFormat("INTEGER"),
            description: "If a monetary figure like Customer Lifetime Value or Deal Size has been included about the user in question, provide this value here. If in a currency other than US Dollar, convert the value to US Dollar.",
          },
        },
        required: dataIfFeedbackFromUserRequiredFields,
      };

      // If may be specifically using a feedback-related function where we don't know the source of the data, define some extra data we'll need for it
      if (!limitedFunctionSupportList || limitedFunctionSupportList.includes("extractUserData")) {
        if (!this.parent.organisationData.userDataAnonymous) {
          this.parent.dataIfFeedbackFromUser.properties.userName = {
            type: this.getParamTypeFormat("STRING"),
            description: "Name/username of the user who provided the feedback, if included.",
          };
        }
        this.parent.dataIfFeedbackFromUser.properties.userCommentTimestamp = {
          type: this.getParamTypeFormat("STRING"),
          description: "Timestamp the user sent the feedback message in the form YYYY-MM-DD HH:MM:SS.",
        };
        this.parent.dataIfFeedbackFromUser.properties.userFeedback = {
          type: this.getParamTypeFormat("STRING"),
          description: "Put in here exactly what the user said about the product.",
        };
      }

      console.log(`Completed this.parent.dataIfFeedbackFromUser: ${JSON.stringify(this.parent.dataIfFeedbackFromUser)}`);
    }

    if (!limitedFunctionSupportList || limitedFunctionSupportList.includes("predictProductBeingReferenced")) {
      try {
        await this.ensureOrganisationDataRetrieved(this.parent.organisationId);
        await this.ensureProductDataAllRetrieved(this.parent.organisationId);
        console.log("ensuredOrganisationDataRetrieved");
        console.log(`this.parent.organisationData.productNames: ${this.parent.organisationData.productNames}`);
        const productNamesPlusUnknown = this.parent.organisationData.productNames;
        productNamesPlusUnknown.push("unknown"); // added to support case where no relevant apps found or none even added yet

        // TODO: improve effectiveness of this function by adding context about each product, like product description, main features...
        // TODO: add support for multiple products being referenced (eg. if a user gives general feedback that could apply to more than one of our products)
        functionDeclarations = this.addToFunctionDeclarations(functionDeclarations, {
          name: "predictProductBeingReferenced",
          description: "Given some data, such as a message from a team member, some feedback from a user or some JSON, try to predict which of the organisation's products are being referenced. The data returned must be a valid JSON object.",
          parameters: {
            type: this.getParamTypeFormat("OBJECT"),
            properties: {
              predictedProductName: {
                type: this.getParamTypeFormat("STRING"),
                description: `Estimate which product from the list this data most likely relates to. Select 'unknown' if there is no suitable product. Here's more info on each for context: ${JSON.stringify(this.parent.productDataAll)}`, // TODO: improve this so removes useless data from productDataAll and replaces productTypes with prettified versions with their descriptions too
                enum: productNamesPlusUnknown,
              },
            },
            required: ["predictedProductName"],
          },
        });
        console.log("Added predictProductBeingReferenced function");
      } catch (err) {
        console.log(`Unable to support predictProductBeingReferenced (may well be because organisationData couldn't be retrieved or no products have been added). Error: ${err}`);
      }
    }

    if (!limitedFunctionSupportList || limitedFunctionSupportList.includes("searchAppReviews")) {
      await this.ensureOrganisationDataRetrieved(this.parent.organisationId);
      this.parent.supportedProductNames = this.parent.organisationData.productNames;
      if (this.parent.supportedProductNames && this.parent.supportedProductNames.length > 0) {
        this.parent.defaultProductName = this.parent.supportedProductNames[0]; // TODO: improve this so not just using first in list but instead what member selects or perhaps what they last asked about
      }
      if (this.parent.organisationData && this.parent.organisationData.organisationPlatformTokens) {
        this.parent.supportedPlatformNames = this.parent.supportedPlatformNames.concat(Object.keys(this.parent.organisationData.organisationPlatformTokens));
      }
      if (this.parent.memberFire) {
        await this.ensureMemberDataRetrieved(this.parent.memberFire);
        if (this.parent.memberData && this.parent.memberData.memberPlatformTokens) {
          this.parent.supportedPlatformNames = this.parent.supportedPlatformNames.concat(Object.keys(this.parent.memberData.memberPlatformTokens));
        }
      }

      functionDeclarations = this.addToFunctionDeclarations(functionDeclarations, {
        name: "searchAppReviews",
        description: "When asked about product reviews, provide an analysis of them. The data returned must be a valid JSON object.",
        parameters: {
          type: this.getParamTypeFormat("OBJECT"),
          properties: {
            queryText: {
              type: this.getParamTypeFormat("STRING"),
              description: "A summary of what the member asked for, with all details included.",
            },
            appName: {
              type: this.getParamTypeFormat("STRING"),
              description: `[Optional field] The name of the product for which reviews are being searched (if one isn't provided, the default product will be searched, which is: ${this.parent.defaultProductName}).`,
              enum: this.parent.supportedProductNames,
            },
            platformNames: {
              type: this.getParamTypeFormat("ARRAY"),
              description: "[Optional field]: The name of the platform(s) for which reviews are being searched (if none are specified, all will be searched). Member may try to refer to 'apple' as 'iOS' and 'android' as 'Google'.",
              items: {
                type: this.getParamTypeFormat("STRING"),
                enum: this.parent.supportedPlatformNames,
              },
            },
          },
          required: ["queryText"],
        },
      });
    }

    if (!limitedFunctionSupportList || limitedFunctionSupportList.includes("setupReport")) {
      await this.ensureOrganisationDataRetrieved(this.parent.organisationId);
      this.parent.supportedProductNames = this.parent.organisationData.productNames;
      if (this.parent.supportedProductNames && this.parent.supportedProductNames.length > 0) {
        this.parent.defaultProductName = this.parent.supportedProductNames[0]; // TODO: improve this so not just using first in list but instead what member selects or perhaps what they last asked about
      }
      if (this.parent.organisationData && this.parent.organisationData.organisationPlatformTokens) {
        this.parent.supportedPlatformNames = this.parent.supportedPlatformNames.concat(Object.keys(this.parent.organisationData.organisationPlatformTokens));
      }
      if (this.parent.memberFire) {
        await this.ensureMemberDataRetrieved(this.parent.memberFire);
        if (this.parent.memberData && this.parent.memberData.memberPlatformTokens) {
          this.parent.supportedPlatformNames = this.parent.supportedPlatformNames.concat(Object.keys(this.parent.memberData.memberPlatformTokens));
        }
      }

      functionDeclarations = this.addToFunctionDeclarations(functionDeclarations, {
        name: "setupReport",
        description: "Setup a report that will query certain data at a given cadence. The data returned must be a valid JSON object.",
        parameters: {
          type: this.getParamTypeFormat("OBJECT"),
          properties: {
            reportCadence: {
              type: this.getParamTypeFormat("STRING"),
              description: "The frequency for which the report should run",
              enum: ["daily", "weekly", "monthly"], // TODO: seems like I can trick the AI into allowing eg. "bi-annual" - so enure this restriction to these values is working properly
            },
            namesOfPlatformSourcesRequestedByMember: {
              type: this.getParamTypeFormat("ARRAY"),
              items: {
                type: this.getParamTypeFormat("STRING"),
                enum: this.parent.supportedPlatformNames,
              },
              description: "The names of platform to search. Member may try to refer to 'apple' as 'iOS' and 'android' as 'Google'",
            },
            productName: {
              type: this.getParamTypeFormat("STRING"),
              description: `[Optional field] The name of the product for which reviews are being searched (if one isn't provided, the default product will be searched, which is: ${this.parent.defaultProductName}).`,
              enum: this.parent.supportedProductNames,
            },
            queryText: {
              type: this.getParamTypeFormat("STRING"),
              description: "A description of what the member is asking to be queried within each report",
            },
          },
          required: ["reportCadence", "namesOfPlatformSourcesRequestedByMember", "queryText"],
        },
      });
    }

    if (!limitedFunctionSupportList || limitedFunctionSupportList.includes("createTicket")) {
      let filteredTaskIssueTypes;
      try {
        await this.ensureOrganisationDataRetrieved(this.parent.organisationId);
        console.log(`this.parent.organisationData: ${this.parent.organisationData}`);
        console.log(`this.parent.organisationData stringify: ${JSON.stringify(this.parent.organisationData)}`);
        filteredTaskIssueTypes = this.parent.filterTaskIssueTypesByProject(this.parent.organisationData.organisationPlatformTokens.atlassian.issueTypes, this.parent.organisationId);
        const filteredTaskIssueTypeIds = filteredTaskIssueTypes.map((issue) => issue.id); // get ids for enum

        console.log(`filteredTaskIssueTypes: ${filteredTaskIssueTypes}`);
        console.log(`filteredTaskIssueTypes 2: ${JSON.stringify(filteredTaskIssueTypes)}`);
        console.log(`filteredTaskIssueTypes: ${typeof filteredTaskIssueTypes}`);

        functionDeclarations = this.addToFunctionDeclarations(functionDeclarations, {
          name: "createTicket",
          description: "Create a ticket with the provided data. If the function fails, it may be because the member hasn't enabled one of the fields they're trying to add within their Jira project. The data returned must be a valid JSON object.",
          parameters: {
            type: this.getParamTypeFormat("OBJECT"),
            properties: {
              summary: {
                type: this.getParamTypeFormat("STRING"),
                description: "Summary of the ticket's goal. Should be <40 characters long.",
              },
              description: {
                type: this.getParamTypeFormat("STRING"),
                description: `Full details about the ticket. Strictly format it as Atlassian Document Format (ADF) (do not escape the format too). Should be well structured, clear and follow the following template where it makes sense:\n${JSON.stringify(constants.TASK_DEFAULT_DESCRIPTION)}`,
              },
              issueType: {
                type: this.getParamTypeFormat("STRING"),
                description: `Put whichever issue type ID number as a string (e.g. '10000') is most suitable from the following (if you're not sure, use the default type's number): : ${JSON.stringify(filteredTaskIssueTypes)}`,
                enum: filteredTaskIssueTypeIds,
              },
              dueDate: {
                type: this.getParamTypeFormat("STRING"),
                description: "Optional: due date of the ticket. AI should return it in format YYYY-MM-DD",
              },
            },
            required: ["summary", "description", "issueType"],
          },
        });
      } catch (err) {
        console.log(`Unable to support creating tickets (may well be because organisationData couldn't be retrieved). Error: ${err}`);
      }
    }

    if (!limitedFunctionSupportList || limitedFunctionSupportList.includes("analyseProductReview")) {
      try {
        functionDeclarations = this.addToFunctionDeclarations(functionDeclarations, {
          name: "analyseProductReview",
          description: "Given a product review, categorise the contents of the review to later save useful data to the database. The data returned must be a valid JSON object.",
          parameters: this.parent.dataIfFeedbackFromUser,
        });
        console.log("Added analyseProductReview function");
      } catch (err) {
        console.log(`Unable to support analyseProductReview. Error: ${err}`);
      }
    }

    if (!limitedFunctionSupportList || limitedFunctionSupportList.includes("extractUserData")) {
      try {
        await this.ensureOrganisationDataRetrieved(this.parent.organisationId);
        let dataIfUncategorisedDescription = `If overarching purpose of the message is uncategorised (ie. it's purpose doesn't fit any of the categories: ${Object.values(constants.DataExtractionTypes)}), extract each message within the thread. The data returned must be a valid JSON object.`;
        if (this.parent.organisationData.userDataAnonymous) {
          dataIfUncategorisedDescription += "\nEnsure identifiable personal user information is anonymised! E.g. it is ok to include their company name, their device name,... but anything that coould be personally identifiable, like their own name or username, should be anonymised.";
        }

        const dataIfUncategorisedMessageThreadProperties = {
          sendTime: {
            type: this.getParamTypeFormat("STRING"),
            description: "Timestamp the message was sent in the form YYYY-MM-DD HH:MM:SS, if included.",
          },
          senderText: {
            type: this.getParamTypeFormat("STRING"),
            description: "Verbatim text of what the sending user said.",
          },
        };
        if (this.parent.organisationData.userDataAnonymous) {
          dataIfUncategorisedMessageThreadProperties.senderEmail = {
            type: this.getParamTypeFormat("STRING"),
            description: "Anonymised email address of the person who sent the message, if included. E.g. 'joe@example.com' should be returned as '_@example.com'",
          };
        } else {
          dataIfUncategorisedMessageThreadProperties.senderEmail = {
            type: this.getParamTypeFormat("STRING"),
            description: "Email address of the person who sent the message, if included.",
          };
          dataIfUncategorisedMessageThreadProperties.senderName = {
            type: this.getParamTypeFormat("STRING"),
            description: "Name of the person who sent the message, if included.",
          };
        }

        functionDeclarations = this.addToFunctionDeclarations(functionDeclarations, {
          name: "extractUserData",
          description: "Given some user data that has been sent to you (eg. feedback or a question), categorise the contents of the data and then save useful data to the database. The data returned must be a valid JSON object.",
          parameters: {
            type: this.getParamTypeFormat("OBJECT"),
            properties: {
              category: {
                type: this.getParamTypeFormat("STRING"),
                description: "The overarching purpose of the data. Use uncategorised if data really doesn't fit into any other category",
                enum: Object.values(constants.DataExtractionTypes),
              },
              dataIfFeedbackFromUser: this.parent.dataIfFeedbackFromUser,
              dataIfUncategorised: {
                type: this.getParamTypeFormat("OBJECT"),
                description: dataIfUncategorisedDescription,
                properties: {
                  subject: {
                    type: this.getParamTypeFormat("STRING"),
                    description: "Subject of the message thread",
                  },
                  messageThread: {
                    type: this.getParamTypeFormat("ARRAY"),
                    description: "Array of message objects representing each message in the thread.",
                    items: {
                      type: this.getParamTypeFormat("OBJECT"),
                      description: "A single message within the potentially multiple messages in the thread. The data returned must be a valid JSON object.",
                      properties: dataIfUncategorisedMessageThreadProperties,
                      required: ["senderText"],
                    },
                  },
                },
                required: ["messageThread"],
              },
            },
            required: ["category"],
          },
        });
        console.log("Added extract message function");
      } catch (err) {
        console.log(`Unable to support extracting message (may well be because organisationData couldn't be retrieved or no apps have been added). Error: ${err}`);
      }
    }

    if (!limitedFunctionSupportList || limitedFunctionSupportList.includes("updateTask")) {
      try {
        await this.ensureAdminSettingsRetrieved();
        const defaultProductAreasKeyList = Object.keys(this.parent.adminSettings.defaultProductAreas);
        const taskEstimationSizesKeyList = Object.keys(this.parent.adminSettings.taskEstimationSizes);
        functionDeclarations = this.addToFunctionDeclarations(functionDeclarations, {
          name: "updateTask",
          description: "Given a task that the product team needs to work on, categorise the contents of the task so that the data can be stored in the database. If an existing version of the task has already been stored, consider for each object property whether it should be updated to reflect the new context or not. The data returned must be a valid JSON object.",
          parameters: {
            type: this.getParamTypeFormat("OBJECT"),
            properties: {
              taskId: {
                type: this.getParamTypeFormat("STRING"),
                description: "A unique, three word name in camel-case used to uniquely summarise the problem (without any special characters).",
              },
              problem: {
                type: this.getParamTypeFormat("STRING"),
                description: "Description of the problem that needs to be solved, as a text string.",
              },
              suggestedSolution: {
                type: this.getParamTypeFormat("STRING"),
                description: "Provide a suggested solution based on the context of the problem and the wider product. This may not necessarily be what users have suggested.",
              },
              relatedProductArea: {
                type: this.getParamTypeFormat("STRING"),
                description: "The area of the product which this tasks is most related to",
                enum: defaultProductAreasKeyList,
              },
              title: {
                type: this.getParamTypeFormat("STRING"),
                description: "A maxmimum 50 character title which describes the goal of the task",
              },
              estimatedOrganisationBenefit: {
                type: this.getParamTypeFormat("STRING"),
                description: `Using the following T-Shirt sizing, estimate the benefit (if any) to the organisation caused by resolving this issue (e.g. if likely revenue increase, likely user number increase, reduced tech debt...). Return the appropriate T-Shirt sizing in camel case like in the sizing guide (e.g. "small", "extraLarge",...): ${JSON.stringify(this.parent.adminSettings.taskEstimationSizes)}`,
                enum: taskEstimationSizesKeyList,
              },
              estimatedUserBenefit: {
                type: this.getParamTypeFormat("STRING"),
                description: `Using the following T-Shirt sizing, estimate the user benefit (if any) caused by resolving this issue. Return the appropriate T-Shirt sizing in camel case like in the sizing guide (e.g. "small", "extraLarge",...): ${JSON.stringify(this.parent.adminSettings.taskEstimationSizes)}`,
                enum: taskEstimationSizesKeyList,
              },
              estimatedUXEffort: {
                type: this.getParamTypeFormat("STRING"),
                description: `Using the following T-Shirt sizing, estimate the effort (if any) required by the design team to create the designs necessary to resolve this issue. Return the appropriate T-Shirt sizing in camel case like in the sizing guide (e.g. "small", "extraLarge",...): ${JSON.stringify(this.parent.adminSettings.taskEstimationSizes)}`,
                enum: taskEstimationSizesKeyList,
              },
              estimatedFEEffort: {
                type: this.getParamTypeFormat("STRING"),
                description: `Using the following T-Shirt sizing, estimate the effort (if any) required by the frontend coding development team to resolve this issue. Return the appropriate T-Shirt sizing in camel case like in the sizing guide (e.g. "small", "extraLarge",...): ${JSON.stringify(this.parent.adminSettings.taskEstimationSizes)}`,
                enum: taskEstimationSizesKeyList,
              },
              estimatedBEEffort: {
                type: this.getParamTypeFormat("STRING"),
                description: `Using the following T-Shirt sizing, estimate the effort (if any) required by the backend coding development team to resolve this issue. Return the appropriate T-Shirt sizing in camel case like in the sizing guide (e.g. "small", "extraLarge",...): ${JSON.stringify(this.parent.adminSettings.taskEstimationSizes)}`,
                enum: taskEstimationSizesKeyList,
              },
            },
            required: ["taskId", "problem", "suggestedSolution", "relatedProductArea", "title", "estimatedOrganisationBenefit", "estimatedUserBenefit", "estimatedUXEffort", "estimatedFEEffort", "estimatedBEEffort"],
          },
        });
        console.log("Added updateTask function");
      } catch (err) {
        console.log(`Unable to support extracting message (may well be because organisationData couldn't be retrieved or no apps have been added). Error: ${err}`);
      }
    }

    if (!limitedFunctionSupportList || limitedFunctionSupportList.includes("createNotification")) {
      try {
        await this.ensureAdminSettingsRetrieved();
        const athenicFeaturesKeyList = Object.keys(this.parent.adminSettings.athenicFeatures);
        const taskEstimationSizesKeyList = Object.keys(this.parent.adminSettings.taskEstimationSizes);
        functionDeclarations = this.addToFunctionDeclarations(functionDeclarations, {
          name: "createNotification",
          description: "Send a notification to one or more members (e.g. to update them of some new data, to suggest they take an action). The data returned must be a valid JSON object.",
          parameters: {
            type: this.getParamTypeFormat("OBJECT"),
            properties: {
              title: {
                type: this.getParamTypeFormat("STRING"),
                description: "A title summarising the notification. Must be under 30 characters.",
              },
              description: {
                type: this.getParamTypeFormat("STRING"),
                description: "Full details of the notification.",
              },
              estimatedPriority: {
                type: this.getParamTypeFormat("STRING"),
                description: `Using the following T-Shirt sizing, estimate the priority of the notification, considering its importance and urgency. Return the appropriate T-Shirt sizing in camel case like in the sizing guide (e.g. "small", "extraLarge",...): ${JSON.stringify(this.parent.adminSettings.taskEstimationSizes)}`,
                enum: taskEstimationSizesKeyList,
              },
              relatedAthenicFeature: {
                type: this.getParamTypeFormat("STRING"),
                description: "The area of Athenic which this notification is most related to",
                enum: athenicFeaturesKeyList,
              },
              // customActions: {
              //   type: this.getParamTypeFormat("ARRAY"),
              //   description: "",
              // },
            },
            required: ["title", "description", "estimatedPriority", "relatedAthenicFeature"],
          },
        });
        console.log("Added createNotification function");
      } catch (err) {
        console.log(`Unable to support creating notification. Error: ${err}`);
      }
    }

    // Repos-related functions
    if (!limitedFunctionSupportList || limitedFunctionSupportList.includes("createDirectoryInRepository")) {
      try {
        functionDeclarations = this.addToFunctionDeclarations(functionDeclarations, {
          name: "createDirectoryInRepository",
          description: "Create a directory",
          strict: true, // note Gemini doesn't support this
          parameters: {
            type: this.getParamTypeFormat("OBJECT"),
            properties: {
              path: {
                type: this.getParamTypeFormat("STRING"),
                description: "The path to the directory to be created",
              },
            },
            required: ["path"],
          },
        });
        console.log("Added createDirectoryInRepository function");
      } catch (err) {
        console.log(`Unable to support createDirectoryInRepository. Error: ${err}`);
      }
    }
    if (!limitedFunctionSupportList || limitedFunctionSupportList.includes("createOrReplaceFileInRepository")) {
      try {
        functionDeclarations = this.addToFunctionDeclarations(functionDeclarations, {
          name: "createOrReplaceFileInRepository",
          description: "Create new file, or overwrite all content within a file if it already exists, with the specified content (code or text)",
          strict: true, // note Gemini doesn't support this
          parameters: {
            type: this.getParamTypeFormat("OBJECT"),
            properties: {
              content: {
                type: this.getParamTypeFormat("STRING"),
                description: "The content to save",
              },
              path: {
                type: this.getParamTypeFormat("STRING"),
                description: "The path to the file, including extension",
              },
            },
            required: ["content", "path"],
          },
        });
        console.log("Added createOrReplaceFileInRepository function");
      } catch (err) {
        console.log(`Unable to support createOrReplaceFileInRepository. Error: ${err}`);
      }
    }
    if (!limitedFunctionSupportList || limitedFunctionSupportList.includes("modifyFileInRepository")) {
      try {
        functionDeclarations = this.addToFunctionDeclarations(functionDeclarations, {
          name: "modifyFileInRepository",
          description: "Modify specific lines in a file without overwriting the entire file content",
          strict: true,
          parameters: {
            type: this.getParamTypeFormat("OBJECT"),
            properties: {
              path: {
                type: this.getParamTypeFormat("STRING"),
                description: "The path to the file, including extension",
              },
              startLine: {
                type: this.getParamTypeFormat("INTEGER"),
                description: "The starting line number to modify (0-indexed)",
              },
              endLine: {
                type: this.getParamTypeFormat("INTEGER"),
                description: "The ending line number to modify (0-indexed, inclusive)",
              },
              newContent: {
                type: this.getParamTypeFormat("STRING"),
                description: "The new content to insert at the specified lines",
              },
            },
            required: ["path", "startLine", "endLine", "newContent"],
          },
        });
        console.log("Added modifyFileInRepository function");
      } catch (err) {
        console.log(`Unable to support modifyFileInRepository. Error: ${err}`);
      }
    }
    if (!limitedFunctionSupportList || limitedFunctionSupportList.includes("listFilesInRepository")) {
      try {
        functionDeclarations = this.addToFunctionDeclarations(functionDeclarations, {
          name: "listFilesInRepository",
          description: "List files in a directory",
          strict: true, // note Gemini doesn't support this
          parameters: {
            type: this.getParamTypeFormat("OBJECT"),
            properties: {
              path: {
                type: this.getParamTypeFormat("STRING"),
                description: "The path to the directory",
              },
            },
            required: ["path"],
          },
        });
        console.log("Added listFilesInRepository function");
      } catch (err) {
        console.log(`Unable to support listFilesInRepository. Error: ${err}`);
      }
    }
    if (!limitedFunctionSupportList || limitedFunctionSupportList.includes("readFileInRepository")) {
      try {
        functionDeclarations = this.addToFunctionDeclarations(functionDeclarations, {
          name: "readFileInRepository",
          description: "Read a file",
          strict: true, // note Gemini doesn't support this
          parameters: {
            type: this.getParamTypeFormat("OBJECT"),
            properties: {
              path: {
                type: this.getParamTypeFormat("STRING"),
                description: "The path to the file",
              },
            },
            required: ["path"],
          },
        });
        console.log("Added readFileInRepository function");
      } catch (err) {
        console.log(`Unable to support readFileInRepository. Error: ${err}`);
      }
    }
    if (!limitedFunctionSupportList || limitedFunctionSupportList.includes("commitToRepository")) {
      try {
        functionDeclarations = this.addToFunctionDeclarations(functionDeclarations, {
          name: "commitToRepository",
          description: "Commit changes to the repo",
          strict: true, // note Gemini doesn't support this
          parameters: {
            type: this.getParamTypeFormat("OBJECT"),
            properties: {
              message: {
                type: this.getParamTypeFormat("STRING"),
                description: "The commit message. Don't use any special characters.",
              },
            },
            required: ["message"],
          },
        });
        console.log("Added commitToRepository function");
      } catch (err) {
        console.log(`Unable to support commitToRepository. Error: ${err}`);
      }
    }
    if (!limitedFunctionSupportList || limitedFunctionSupportList.includes("makePullRequestToRepository")) {
      try {
        functionDeclarations = this.addToFunctionDeclarations(functionDeclarations, {
          name: "makePullRequestToRepository",
          description: "Creates a new branch and makes a pull request",
          strict: true, // note Gemini doesn't support this
          parameters: {
            type: this.getParamTypeFormat("OBJECT"),
            properties: {
              title: {
                type: this.getParamTypeFormat("STRING"),
                description: "The title of the pull request. Don't use any special characters.",
              },
            },
            required: ["title"],
          },
        });
        console.log("Added makePullRequestToRepository function");
      } catch (err) {
        console.log(`Unable to support makePullRequestToRepository. Error: ${err}`);
      }
    }

    console.log(`functionDeclarations added: ${JSON.stringify(functionDeclarations)}`);
    console.log(`functionDeclarations added with length: ${functionDeclarations.length}`);
    return functionDeclarations;
  }

  escapeString(input) {
    // If put all in a single quotes tring and then replace any single quotes with '\'' pattern, all will be safe for running in a terminal command
    return `'${input.replace(/'/g, "'\\''")}'`;
  }
}

module.exports = NLPSharedFunctions;
