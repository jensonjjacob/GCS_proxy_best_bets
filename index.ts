import * as cors from 'cors';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import {GaxiosError, GaxiosResponse} from 'gaxios';
import {google} from 'googleapis';

// Supporting CORS
const corsWrapper = cors({origin: true});

// Importing keys and configuration
// tslint:disable-next-line: no-require-imports
const serviceAccount = require('./cloudsearch_service_account.json');
const userToImpersonate = require('./user_config.json').userToImpersonate;

// PubSub Info from config files
const {PubSub} = require('@google-cloud/pubsub');
const mytopicName = require('./pubsub_config.json').topicName;
const mytopicNameClickLog = require('./pubsub_config.json').topicNameClickLog;
const myserviceAccount = require('./cloudsearch_service_account.json');

// Global variables to reuse
let userQuery: any;
let searchApplication: any;
let queryDateTime: any;
let nbSearchResults: any;
let promotedResult: any;
let clickedUrl: any;
let linkRank: any;

// User authentication/impersonation
const adminConfig = JSON.parse(process.env.FIREBASE_CONFIG!);
adminConfig.credential = admin.credential.cert(serviceAccount);
admin.initializeApp(adminConfig);

const SCOPES = ['https://www.googleapis.com/auth/cloud_search'];

const cloudsearch = google.cloudsearch({
  version: 'v1',
  auth: new google.auth.JWT(
      serviceAccount.client_email,
      undefined,
      serviceAccount.private_key,
      SCOPES,
      userToImpersonate,
      )
});

// Standardizing handling of error for REST request to GCS
const onFailure = (reason: GaxiosError, userResponse: functions.Response) => {
  userResponse.statusCode = reason.response ? reason.response.status : 400;
  userResponse.json(
      reason.response ? reason.response.data :
                        'Unknown Error, check server logs.');
};

// Standardizing handling of success for REST request to GCS
const onSuccess =
    async (apiResponse: GaxiosResponse, userResponse: functions.Response) => {
      userResponse.statusCode = apiResponse.status;
      // Capture the number of search results. Will be sent to analytics
      try {
        nbSearchResults = apiResponse.data.results.length.toString()
      }
      catch (e) {
        nbSearchResults = '0'
      };
      // Call function to check if there is a promoted result associated with the query
      await promotedResults(userQuery);
      // Build a new JSON response with additional data, including the promoted results details
      const longresponse = [{'mainResponse':apiResponse.data, 'nbResults':nbSearchResults, 'originalQuery': userQuery, 'searchApplication': searchApplication, 'queryDate': queryDateTime, 'promotedResult': promotedResult}];
      userResponse.json(longresponse);
      triggerPublish();
    };

// Search endpoint
exports.search = functions.https.onRequest(
    (req, res) => corsWrapper(req, res, () => {
      cloudsearch.query.search({requestBody: req.body})
          .then((response) => {
            const queryDate = new Date();
            const queryDateString = queryDate.toString();
            userQuery = req.body.query;
            searchApplication = req.body.requestOptions.searchApplicationId;
            queryDateTime = queryDateString;
            console.log('userQuery in search ' + userQuery);
            // tslint:disable-next-line: no-floating-promises
            onSuccess(response, res)
          })
          .catch(reason => {
            onFailure(reason, res);
          });
    }));

// Query Suggest endpoint
exports.suggest = functions.https.onRequest(
  (req, res) => corsWrapper(req, res, () => {
    cloudsearch.query.suggest({requestBody: req.body})
          .then((response) => {
            // tslint:disable-next-line: no-floating-promises
            onSuccess(response, res);
          })
          .catch(reason => {
            onFailure(reason, res);
          });
    }));

// Function to trigger a PubSub publish of the analytics data
function triggerPublish() {
  console.log('userQuery in triggerPublish ' + userQuery);
  // tslint:disable-next-line: no-floating-promises
  publishPubSub(userQuery, searchApplication, queryDateTime, nbSearchResults);
  console.log('Transferred to PubSub Function')
}

// Publish analytics to PubSub topic. That will trigger another cloud function to push the info to Big Query
function publishPubSub(query: any, application: any, date: any, results: any) {
  const pubsub = new PubSub({myserviceAccount});
  const data = JSON.stringify({query: query});
  const dataBuffer = Buffer.from(data);
  const customAttributes = {
    query: query,
    application: application,
    datetime: date,
    nbsearchresults: results
  };
  console.log(
      'Message for PubSub: ' + query + ', ' + application + ', ' + date + ', ' +
      results)
  const messageId = pubsub  // await pubsub
                        .topic(mytopicName)
                        .publish(dataBuffer, customAttributes);
  console.log(`Message ${messageId} published`);
}

// Function to query Firestore DB and check if there is a promoted result associated with the query
function promotedResults(thequery:any) {
  let db;
  db = admin.firestore();

  console.log(`The query was: ${thequery}`);
  const promotedResultsRef = db.collection('promoted-results');
  const promotedQuery = promotedResultsRef.where('query', '==', thequery)
                            .get()
                            .then(snapshot => {
                              if (snapshot.empty) {
                                console.log('No matching document');
                                promotedResult = "No matching document";
                                return;
                              }

                              snapshot.forEach(doc => {
                                console.log(doc.id, '=>', doc.data());
                                const data = doc.data();
                                promotedResult = {title: data.title, description: data.description, url: data.url};
                              });
                            })
                            .catch(err => {
                              console.log('Error getting documents', err);
                            });
  return promotedQuery;
}

// Click log endpoint
exports.clicklog = functions.https.onRequest((req, res) => corsWrapper(req, res, () => {
    try {
      const data = req.body;
      userQuery = req.body.query;
      clickedUrl = req.body.clickedUrl;
      linkRank = req.body.rank;
      queryDateTime = new Date().toString();
      console.log("Data: " + JSON.stringify(data));
      console.log("URL Clicked: " + clickedUrl);
      console.log("Current Query: " + userQuery);
      console.log("Result Rank: " + linkRank);
      publishPubSubClickLog(userQuery, clickedUrl, queryDateTime, linkRank);
      res.status(200).json({message: "all good"});
    }
    catch(e) {
      console.log(e);
      res.status(400).json({message: "all bad"});
    }
  }
));

// Publish analytics to PubSub topic. That will trigger another cloud function to push the info to Big Query
function publishPubSubClickLog(query: any, url: any, date: any, rank: any) {
  const pubsub = new PubSub({myserviceAccount});
  const data = JSON.stringify({query: query});
  const dataBuffer = Buffer.from(data);
  const customAttributes = {
    query: query,
    url: url,
    date: date,
    rank: rank
  };
  console.log(
      'Message for PubSub: ' + query + ', ' + url + ', ' + date + ', '+ rank)
  const messageId = pubsub  // await pubsub
                        .topic(mytopicNameClickLog)
                        .publish(dataBuffer, customAttributes);
  console.log(`Message ${messageId} published`);
}
