# Holliston Real Estate Sales

Web scraping real estate sales numbers for the town of Holliston MA.

Stack:
- Node, Axios and Cheerio for the scraping
- [AWS Textract](https://aws.amazon.com/textract/) for OCR (most sales numbers are *images* _retch_) against images stored in S3.
- Output stored in DyanmoDB.
