# usage instructions

this is super rough at the moment and these instructions aren't really written yet! but if you're feeling adventurous I suggest editing the functions in `./main.ts` that define various pipelines to get the outcomes you want.

DenoKV (probably backed by sqlite) is used for cross-run persistence


## backdating

if you have access to the database of the gotosocial instance you're republishing posts to, you can generate sql queries to backdate those posts:

```
./run.sh --targetAcct myaccount@instance --backdating-query
```

this will create a sql file in the working directory with lines like this:
```
update statuses set created_at=TIMESTAMP WITH TIME ZONE '2022-10-27T18:22:12.000-07:00' where id='01JETPNE0DT8VVAZVZM957DGA6';
update statuses set created_at=TIMESTAMP WITH TIME ZONE '2022-10-27T23:03:43.000-07:00' where id='01JETPNED5AD7YH5A3HSJYPRFS';
update statuses set created_at=TIMESTAMP WITH TIME ZONE '2022-10-28T20:39:40.000-07:00' where id='01JETPNEG8J752SNN0K73Y22HF';
```

if you're using gotosocial & postgres, you can then execute those queries; e.g. via first running `sudo -u postgres psql -d gotosocial`

after you execute the queries, restart gotosocial for the timestamps to update. api requests and rendered pages including the posts should be ordered correctly after restarting, too.


# dev instructions

[deno environment setup](https://docs.deno.com/runtime/getting_started/setup_your_environment/)
