#!/bin/bash

# You must deploy to the stage before running this script! 

# using text value for parameters did not allow multiple values for extensions.  Use json instead.
aws apigateway get-export --rest-api-id s1l04bl4xb --stage-name api --export-type swagger --parameters '{"extensions":"integrations,authorizers"}' hres.json

# Meh - not sure how useful this is... 
# aws apigateway get-sdk --rest-api-id 8dqz0v87p3 --stage-name dev --sdk-type javascript compare_yourself_sdk.zip 
