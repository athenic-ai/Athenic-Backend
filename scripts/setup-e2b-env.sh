#!/bin/bash

# Setup E2B Environment Script
# This script sets up the necessary environment variables for E2B testing

# Bold formatting
bold=$(tput bold)
normal=$(tput sgr0)

echo "${bold}Athenic E2B Environment Setup${normal}"
echo "==============================="
echo

# Check if E2B_API_KEY is already set
if [ -z "$E2B_API_KEY" ]; then
  echo "E2B_API_KEY is not set"
  echo "Please enter your E2B API key (sign up at https://e2b.dev if you don't have one):"
  read -p "> " api_key
  
  # Export the API key for the current session
  export E2B_API_KEY="$api_key"
  
  # Suggest adding to .zshrc
  echo 
  echo "To make this permanent, add the following line to your ~/.zshrc file:"
  echo "  export E2B_API_KEY=$api_key"
else
  echo "E2B_API_KEY is already set to: ${E2B_API_KEY:0:5}..."
fi

echo
echo "${bold}Environment Variables:${normal}"
echo "E2B_API_KEY=${E2B_API_KEY:0:5}..." # Only show first 5 chars for security

echo
echo "${bold}Next Steps:${normal}"
echo "1. Deploy the Athenic template with: node e2b/deploy-template.js"
echo "2. Run the demo script with: node tests/e2b-simple-demo.js"

echo
echo "Environment setup complete!" 