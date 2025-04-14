#!/bin/bash

# Start E2B Server Script
# This script starts the Express server for E2B sandbox testing

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check for required tools
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed.${NC}"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Change to the project directory
cd "$(dirname "$0")/.." || exit 1

# Make sure E2B API key is set
if [ -z "$E2B_API_KEY" ]; then
    echo -e "${YELLOW}Warning: E2B_API_KEY is not set.${NC}"
    echo "Running setup script to configure environment..."
    source ./scripts/setup-e2b-env.sh
fi

# Install dependencies if needed
if [ ! -d "node_modules" ] || [ ! -d "node_modules/e2b" ]; then
    echo -e "${BLUE}Installing dependencies...${NC}"
    npm install
fi

# Start the server in the background
echo -e "${BLUE}Starting E2B Server...${NC}"
node server/server.js &
SERVER_PID=$!

# Wait for server to start - increasing sleep time to ensure server is properly started
sleep 5

# Check if server is running
if ! ps -p $SERVER_PID > /dev/null; then
    echo -e "${RED}Error: Server failed to start.${NC}"
    exit 1
fi

# Provide instructions
echo -e "\n${GREEN}E2B Server is running on http://localhost:3333${NC}"
echo -e "\n${BLUE}===== Testing Instructions =====${NC}"
echo -e "1. Deploy the Athenic agent template (only needed once):"
echo -e "   ${YELLOW}node e2b/deploy-template.js${NC}"
echo -e "\n2. You can test the server API directly:"
echo -e "   ${YELLOW}curl -X POST -H \"Content-Type: application/json\" -H \"X-API-Key: test-api-key-for-development\" \\
     -d '{\"command\":\"ls -la\", \"templateId\":\"base\"}' \\
     http://localhost:3333/api/sandbox/run${NC}"
echo -e "\n3. Or use the simple demo script:"
echo -e "   ${YELLOW}node tests/e2b-simple-demo.js${NC}"
echo -e "\n4. Or run the Flutter app and navigate to the Sandbox screen."
echo -e "\n5. To view server logs:"
echo -e "   ${YELLOW}tail -f server.log${NC}"
echo -e "\n6. To stop the server, press Ctrl+C"
echo -e "${BLUE}===============================${NC}\n"

# Trap SIGINT to ensure clean exit
trap "echo -e '\n${RED}Stopping server...${NC}'; kill $SERVER_PID; exit 0" INT

# Wait for user to press Ctrl+C
while true; do
    sleep 1
done 