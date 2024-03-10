# MovieNightBot

A discord bot that monitors a channel for IMDB or RT links and adds them to a CSV file with default watched set to false. It also has a few slash commands to manage the data and export it for use.


## Installation/Usage:

You will need to update these values in config.json:
```
  "guild_id": "",
  "client_id": "",
  "token": "",
  "tmdbApiKey": "",
```

run 
* npm install
* node app

to launch the app


## Commands:
Parenthesis signify optional parameter.
Brackets signify required parameter.
Colons signify default value.

* /list_all_movies (include_watched:false) (raw:false)
Lists all movies in the database and exports a CSV.  include_watched will tell it if you want it to include movies that have been watched or not. 

* /give_random_movies (include_watched:false) (number_of_movies:10)
Lists a given number of random movies from the movieDB. include_watched will tell it if you want it to include movies that have been watched or not. 

* /toggle_watched [title:]
Toggle the 'watched' status of a movie between watched and not watched.

* /remove_movie [title:]
Remove a movie and its watched status from the DB.

* /set_channel
Set the channel where the bot listens and gives info. 


I am by no means an expert at discord bot dev, javascript, or anything for that matter. This was going to help out my friends a lot, so I made it happen :)
