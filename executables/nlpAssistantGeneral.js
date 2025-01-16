// NOTE: This file is run independently of the rest of the project
// NOTE: Run node ./executables/nlpAssistantDeveloper.js every time ou make a change here

const OpenAI = require("openai");
const NLPSharedFunctions = require("./../plugins/nlp/nlpSharedFunctions");
require("dotenv").config();
const localConfig = require("/Users/maxbeech/Documents/Beech/Development/Athenic/localConfig.json"); // These are stored here as they're private and don't want them in Git
const openaiApiKey = localConfig.openaiApiKey;
const openai = new OpenAI({apiKey: openaiApiKey});
const admin = require("firebase-admin");

async function createAssistantDeveloper() {
  const nlpSharedFunctions = new NLPSharedFunctions(this, admin);
  const functionDeclarations = await nlpSharedFunctions.getFunctionDeclarations(["createDirectoryInRepository", "createOrReplaceFileInRepository", "modifyFileInRepository", "listFilesInRepository", "readFileInRepository", "commitToRepository", "makePullRequestToRepository"]);
  const aiDeveloper = await openai.beta.assistants.create({
    instructions: `You are an AI developer. You help user work on their tasks related to coding in their codebase. The provided codebase is in the /home/user/repo.
  When given a coding task, work on it until completion, commit it, and make pull request.
  If you encounter a problem, communicate it promptly, please.
  You can create content (text or code) within a new file, modify an existing file, list files in a given directory, read files, commit changes, and make pull requests. Always make sure to write the content in the codebase.
  By default, always either commit your changes or make a pull request after performing any action on the repo. This helps in reviewing and merging your changes.
  Name the PR based on the changes you made.
  Be professional, avoid arguments, and focus on completing the task.
  Always follow best software engineering practices, including making the code well structured, understandable and maintainable.
  When you finish the task, always provide the link to the pull request you made (if you made one.)
  Additionally, be prepared for discussions; not everything user writes implies changes to the repo. For example, if the user writes "thank you", you can simply answer "you are welcome".
  But by default, if you are assigned a task, you should immediately do it in the provided repo, and not only talk about your plan.`,
    name: "AI Developer",
    tools: functionDeclarations,
    useLiteModel: false,
  });

  console.log(`\n\nAssistant Developer created. Run:\nfirebase functions:secrets:set NLP_ASSISTANT_DEVELOPER_ID\nAnd then enter its ID:\n${aiDeveloper.id}`);
}

createAssistantDeveloper();
