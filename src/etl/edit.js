'use strict';

//see main() function for documentation
const fs = require('fs');

const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');

const REGION = 'us-east-2';
const DYNAMODB_TABLE = 'hres-20210218';

const client = new DynamoDBClient({
  region: REGION,
  logger: console,
  debug: false
});

const rawData = fs.readFileSync('../../scan.json');
const scan = JSON.parse(rawData);

(async () => {
  for (const item of scan.Items) {
    //PK format: STREET#<street name>
    const [_, streetName] = item.PK.S.split('#');
    const pk = 'STREET#' + streetName;

    //SK Format: <street number>#<YYYYMM>
    const [yyyymm, price, streetNumber] = item.SK.S.split('#');
    const sk = streetNumber + '#' + yyyymm;

    //GSI
    const monthAsNumber = yyyymm.slice(4);
    //GK format: YEAR#<yyy>
    const gsipk1 = 'YEAR#' + item.Year.N;
    //SK format: <street name>#<street number>#<yyyymm>
    const gsisk1 = streetName + '#' + streetNumber + '#' + yyyymm;

    const params = {
      TableName: DYNAMODB_TABLE,
      Item: {
        PK: {
          S: pk
        },
        SK: {
          S: sk
        },
        GSIPK1: {
          S: gsipk1
        },
        GSISK1: {
          S: gsisk1
        },
        SourceUrl: {
          S: item.SourceUrl.S
        },
        Month: {
          S: monthAsNumber
        },
        MonthName: {
          S: item.Month.S
        },
        Year: {
          N: item.Year.N
        },
        Address: {
          S: item.Address.S
        },
        Buyer: {
          S: item.Buyer.S
        },
        Seller: {
          S: item.Seller.S
        },
        Price: {
          N: item.Price.N
        }
      }
    };

    console.log('PutItemCommand params', JSON.stringify(params)); //, null, 2));
    const command = new PutItemCommand(params);

    try {
      await client.send(command);
    } catch (error) {
      console.warn(error);
    }
  }
})();
