import * as nlpFunctionsData from "./nlpFunctionsData.ts";

// Define the base class
export class NlpFunctionsBase {
  private parent: any;
  public nlpFunctions: Record<string, { declaration: any; implementation: Function }>;

  constructor(parent: any) {
    this.parent = parent;
    this.nlpFunctions = {};
  }

  async loadFunctions() {
    const dataFunctions = await nlpFunctionsData.initialiseFunctions(this);
    Object.assign(this.nlpFunctions, dataFunctions);
    console.log("All NLP functions loaded:", this.nlpFunctions);
  }

  // Method to retrieve all declarations as a list
  getAllFunctionDeclarations() {
    const declarations = [];
    for (const key in this.nlpFunctions) {
      const { declaration } = this.nlpFunctions[key];
      if (declaration) {
        declarations.push(declaration);
      }
    }
    return declarations;
  }
}
