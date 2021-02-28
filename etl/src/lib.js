'use strict';

const REGION = 'us-east-2';
const S3_BUCKET = 'holliston-real-estate-sales';
const DYNAMODB_TABLE = 'hres-20210218';

const getErrorMessage = (fn, url, error) => {
  let msg = `fetch of ${url} returned `;

  if (error.message) {
    msg += `${error.status} (${error.statusText})`;
  } else {
    msg += JSON.stringify(error);
  }

  return msg;
};

module.exports = {
  REGION,
  S3_BUCKET,
  DYNAMODB_TABLE,
  getErrorMessage
};
