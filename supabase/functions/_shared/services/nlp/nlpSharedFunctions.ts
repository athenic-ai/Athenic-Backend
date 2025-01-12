const config = require("../../config");
const ReposPlugin = require("../repos/reposE2BPlugin");

// NOTE: need to re-run executables if you update functions here!!! (see note in /executables file(s) if so)
export class NLPSharedFunctions {
  constructor(parent, admin) {
    // Store the reference to the parent class
    this.parent = parent;
    this.admin = admin;
    this.reposPlugin = new ReposPlugin();
    this.nlpFunctions = { // TODO: maybe 
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

  async ensureMemberDataRetrieved(memberId) {
    if (!this.parent.memberData) {
      // This presumes we are happy to assume that by the time the Firebase Function has completed, we havent saved member data (without updating it here) and then wanted to retrieve that updated data
      const memberDoc = await this.parent.storagePlugin.getDoc(`members/${memberId}`);
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

  addToFunctionDeclarations(curFunctionDeclarations, newFunction) {
    console.log(`Adding function: ${JSON.stringify(newFunction)}`);
    newFunction.parameters.additionalProperties = false; // OpenAI needs this
    curFunctionDeclarations.push({
      "type": "function",
      "function": newFunction,
    });
    return curFunctionDeclarations; // OpenAI needs this surrounding map
  }

  async getFunctionDeclarations(limitedFunctionSupportList) {
    // Note: Ensure functions you want to support are added to wherever nlp is initialised. If limitedFunctionSupportList is null, it means we want to support all functions. If it's [], means you dont want to support any.
    // TODO: add support for Structured Outputs (strict=true) across all functions if called by openai
    console.log(`getFunctionDeclarations called with limitedFunctionSupportList: ${limitedFunctionSupportList}`);
    let functionDeclarations = [];

    if (!limitedFunctionSupportList || limitedFunctionSupportList.includes("predictProductBeingReferenced")) {
      try {
        await this.ensureOrganisationDataRetrieved(this.parent.organisationId);

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

    console.log(`${functionDeclarations.length} functionDeclarations added: ${JSON.stringify(functionDeclarations)}`);
    return functionDeclarations;
  }
}