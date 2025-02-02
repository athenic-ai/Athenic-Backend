import * as nlpFunctionsData from "./nlpFunctionsData.ts";
import * as nlpFunctionsDataHelpers from "./nlpFunctionsDataHelpers.ts";
import * as nlpFunctionsEcommerce from "./nlpFunctionsEcommerce.ts";

// Define the base class
export class NlpFunctionsBase {
  private parent: any;
  public nlpFunctions: Record<string, { declaration: any; implementation: Function }>;
  
  // Map module names to their imported modules
  private moduleMap: Record<string, any> = {
    'nlpFunctionsData': nlpFunctionsData,
    'nlpFunctionsDataHelpers': nlpFunctionsDataHelpers,
    'nlpFunctionsEcommerce': nlpFunctionsEcommerce,
  };

  constructor(parent: any) {
    this.parent = parent;
    this.nlpFunctions = {};
  }

  // Updated loadFunctionGroups method to load all modules by default if none specified
  // moduleNames parameter is optional - if not provided, loads all available modules
  async loadFunctionGroups(moduleNames?: string[]) {
    this.nlpFunctions = {}; // Ensure nlpFunctions is empty at the start of this function to not retain functions we no longer want
    // If no modules specified, use all available module names from moduleMap
    const modulesToLoad = moduleNames || Object.keys(this.moduleMap);
    
    console.log("loadFunctionGroups called with modules:", modulesToLoad);

    for (const moduleName of modulesToLoad) {
      try {
        const module = this.moduleMap[moduleName];
        if (!module) {
          console.warn(`Module ${moduleName} not found in moduleMap`);
          continue;
        }
        
        // Initialise functions from the module
        if (typeof module.initialiseFunctions === 'function') {
          const functions = await module.initialiseFunctions(this);
          Object.assign(this.nlpFunctions, functions);
          console.log(`Successfully loaded functions from ${moduleName}`);
        } else {
          console.warn(`Module ${moduleName} does not have initialiseFunctions method`);
        }
      } catch (error) {
        console.error(`Error loading functions from ${moduleName}:`, error);
        // Continue loading other modules even if one fails
      }
    }

    console.log("All NLP functions loaded:", this.nlpFunctions);
  }

  // Method to retrieve declarations as a list
  getFunctionDeclarations(keys?: string[]) {
    // If keys not specified, gets all
    const declarations = [];
    for (const key in this.nlpFunctions) {
      if (keys && !keys.includes(key)) {
        continue;
      }
      const { declaration } = this.nlpFunctions[key];
      if (declaration) {
        declarations.push(declaration);
      }
    }
    return declarations;
  }
}