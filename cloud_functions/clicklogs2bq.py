import io
import json
import base64
import os
import datetime
from google.cloud import bigquery

def get_pubsub_data(data, context):
    payload = base64.b64decode(data['data']).decode('utf-8')
    query = data['attributes']['query']
    url = data['attributes']['url']
    date = data['attributes']['date']
    rank = data['attributes']['rank']
    print('Query: ' + query)
    print('Url: ' + url)
    print('Date/Time: ' + date)
    print('Rank: ' + rank)
    write_to_bigquery(query, url, date, rank)

def write_to_bigquery(query, url, date, rank):
    client = bigquery.Client()
    dataset_id = os.environ['DATASET_ID']
    table_id = os.environ['TABLE_ID']
    table_ref = client.dataset(dataset_id).table(table_id)
    table = client.get_table(table_ref)
    
    datetime_string = date.split(' (')
    datetime_string = datetime_string[0]
    datetime_date = datetime.datetime.strptime(datetime_string, '%a %b %d %Y %H:%M:%S %Z%z')
    
    rows_to_insert = [
        (query, url, datetime_date, rank),
        ]
    
    errors = client.insert_rows(table, rows_to_insert)  # API request
    assert errors == []
