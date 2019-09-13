# Cloud Search Proxy
**!!! DEMO CODE !!!**
**!!! DO NOT USE IN PRODUCTION !!!**

###The Search Proxy serves multiple purposes:
- Cloud Search requires to perform queries as an authenticated user. The proxy impersonates a G Suite user in order to perform queries from a public website
- Provides a /search end-point to send the queries to (e.g. from a website search box)
- Provides a /suggest end-point to receive query suggestions (e.g. while a user is typing a query)
- Sends the query and results data to Google BigQuery using PubSub and Cloud Functions
- Sends Click-logs to Google BigQuery using PubSub and Cloud Functions
- Queries a Firebase/Firestore database against a potential "best bet" match on the query (literal match)

The proxy is mainly written in TypeScript and is meant to be deployed using Google Firebase Functions. The analytics functions are written in Python and run as independent Google Functions triggered by PubSub events.

The best bets database is based on Firestore, a NoSQL database

Running the code requires to have an active Cloud Search deployment, proper service accounts, domain-wide delegation in place (see Cloud Search documentation for more details. https://developers.google.com/cloud-search/docs/guides/)
