'use strict';

//This function triggers on S3 update,
//sends the image to S3 textract and
//does some postprocessing on the results.

const {
  TextractClient,
  DetectDocumentTextCommand
} = require('@aws-sdk/client-textract');
