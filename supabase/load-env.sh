#!/bin/bash

# Script to load environment variables from .env file into Supabase

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "Supabase CLI is not installed. Please install it first."
    exit 1
fi

# Load variables from .env file
if [ -f .env ]; then
    echo "Loading environment variables from .env file..."
    
    # Read each line from .env file
    while IFS= read -r line || [ -n "$line" ]; do
        # Skip empty lines and comments
        if [[ -z "$line" || "$line" =~ ^# ]]; then
            continue
        fi
        
        # Extract variable name and value
        key=$(echo "$line" | cut -d '=' -f 1)
        value=$(echo "$line" | cut -d '=' -f 2-)
        
        # Set the variable in Supabase
        echo "Setting $key..."
        supabase secrets set "$key=$value"
    done < .env
    
    echo "Environment variables loaded successfully!"
else
    echo "Error: .env file not found."
    exit 1
fi 