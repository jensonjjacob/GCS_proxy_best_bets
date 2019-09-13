import io
import json
import base64
import os
import datetime
from google.cloud import bigquery

def get_pubsub_data(data, context):
    payload = base64.b64decode(data['data']).decode('utf-8')
    query = data['attributes']['query']
    application = data['attributes']['application']
    datetime = data['attributes']['datetime']
    nbsearchresults = data['attributes']['nbsearchresults']
    print('Query: ' + query)
    print('Application: ' + application)
    print('Date/Time: ' + datetime)
    print('Number of Results: ' + nbsearchresults)
    write_to_bigquery(query, application, datetime, nbsearchresults)

def write_to_bigquery(query, application, datetime_string, nbsearchresults):
    client = bigquery.Client()
    dataset_id = os.environ['DATASET_ID']
    table_id = os.environ['TABLE_ID']
    table_ref = client.dataset(dataset_id).table(table_id)
    table = client.get_table(table_ref)
    
    nbsearchresults_int = int(nbsearchresults)
    
    datetime_string = datetime_string.split(' (')
    datetime_string = datetime_string[0]
    datetime_date = datetime.datetime.strptime(datetime_string, '%a %b %d %Y %H:%M:%S %Z%z')
    
    rows_to_insert = [
        (query, application, datetime_date, nbsearchresults_int),
        ]
    
    errors = client.insert_rows(table, rows_to_insert)  # API request
    assert errors == []
