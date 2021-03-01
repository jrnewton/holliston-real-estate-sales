# Holliston Real Estate Sales

Web scraping real estate sales numbers for the town of Holliston MA. All recent data is stored as _images_ (**retch**) which makes the problem a little bit more interesting :)

Stack:

- Node, Axios and Cheerio for the scraping
- Images are stored in S3 and OCR is performed via [AWS Textract](https://aws.amazon.com/textract/)
- Final output stored in DyanmoDB

## To Do

In no particular order.

- [ ] add kuid to all records, but not part of a key (for use by Vue).

- [ ] Make sure numbers are zero padded for lexigraphical sorting.

- [ ] Split ETL into process up into lambda functions:

  - Local node.js program: parse website and upload images to S3 bucket. Eventually run this program on scheduled EC2 instance.
  - Lambda function triggered on S3 bucket update: put image through AWS textract, output into DynamoDB table "hres_etl_textract" with PK=S3 URI of image.
  - Lambda function triggered on DynamoDB stream: convert textract into records and insert into DynamoDB table "hres_prod".

- [ ] Refine data modeling using NoSQL workbench.

- [ ] Refine API gateway model. Need another resource for GSI. Maybe close to done.

- [ ] Build UI version 1.

- [ ] Register a domain.

- [ ] Buy google ads?
