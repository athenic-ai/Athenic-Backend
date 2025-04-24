#!/bin/bash

# Script to deploy the consumer app messaging endpoint

echo "Deploying consumer app messaging endpoint..."

# Navigate to the Supabase functions directory (adjust if needed)
cd "$(dirname "$0")/../.."

# Deploy the function
# Note: You may need to be logged in to Supabase CLI first with 'supabase login'
supabase functions deploy messaging/con/company --project-ref gvblzovvpfeepnhifwqh

echo "Deployment complete. Test the endpoint at: https://gvblzovvpfeepnhifwqh.supabase.co/functions/v1/messaging/con/company" 