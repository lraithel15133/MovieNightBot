const { Client, GatewayIntentBits, Events } = require("discord.js");
const { writeFile } = require('fs/promises');
const client = new Client({ intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent ] });
const { token, guild_id, client_id, tmdbApiKey} = require('./config.json');
const axios = require('axios');
const { Routes } = require('discord-api-types/v9');
const { REST } = require('@discordjs/rest');
const rest = new REST({ version: '9' }).setToken(token);
let { allowedChannelId } = require('./config.json');
const fs = require('fs');
const csvParser = require('csv-parser');
const { parse, stringify } = require('json2csv');
const csvFilePath = 'moviesdb.csv';
const path = require('path');


const commands = [{
	name: 'set_channel',
	description: 'Sets the channel where the bot will listen for links.'
  },
  {
    name: 'give_random_movies',
    description: 'Lists random movies and exports them to CSV.',
    options: [
      {
        name: 'number_of_movies',
        type: 4, 
        description: 'Number of random movies to list and export.',
        required: false,
      },
      {
        name: 'include_watched',
        type: 5,
        description: 'Whether to include watched movies. (default: false)',
        required: false,
      },
    ],
  },
  {
	name: 'list_all_movies',
	description: 'Exports CSV of all movies from the database.',
  options: [
      {
        name: 'include_watched',
        type: 5,
        description: 'Whether to include watched movies. (default: false)',
        required: false,
      },
      {
        name: 'raw',
        type: 5,
        description: 'Export raw CSV. (default: false)',
        required: false,
      },
    ],
  },
  {
    name: 'remove_movie',
    description: 'Remove a movie from the database.',
    options: [
      {
        name: 'title',
        type: 3,
        description: 'Name of the movie to remove',
        required: true,
      },
    ],
  },
  {
    name: 'toggle_watched',
    description: 'Toggle the watched status of a movie.',
    options: [
      {
        name: 'title',
        type: 3, 
        description: 'Name of the movie to toggle watched status for',
        required: true,
      },
    ],
  }
];

client.on('ready', async () => {
	try {
	  console.log('Started refreshing application (/) commands.');
  
	  await rest.put(
		Routes.applicationGuildCommands(client_id, guild_id),
		{ body: commands },
	  );
  
	  console.log('Successfully reloaded application (/) commands.');
	} catch (error) {
	  console.error(error);
	}
  });

//command handler
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const commandHandlers = {
        'set_channel': async () => await setChannel(interaction, interaction.channelId),
        'give_random_movies': async () => await listRandomMovies(interaction, interaction.options.getInteger('number_of_movies') || 10, interaction.options.getBoolean('include_watched') || false),
        'list_all_movies': async () => await exportCsv(interaction, interaction.options.getBoolean('include_watched') || false, interaction.options.getBoolean('raw') || false),
        'import_movies': async () => await importMovies(interaction, interaction.options.getString('titles')),
        'remove_movie': async () => await removeMovie(interaction, interaction.options.getString('title')),
        'toggle_watched': async () => await toggleWatched(interaction, interaction.options.getString('title'))
    };

    const handler = commandHandlers[interaction.commandName];
    if (handler) {
        await handler();
    }
});

client.on(Events.MessageCreate, async (message) => {
	if (shouldIgnoreMessage(message)) return;
  
	const links = extractLinksFromMessage(message);
	for (const link of links) {
		if (!isValidLink(link)) continue;
		await processLink(link, message);
	}
  });

function shouldIgnoreMessage(message) {
	return message.author.bot || message.channel.id !== allowedChannelId;
}
function extractLinksFromMessage(message) {
    return message.content.match(/https?:\/\/[^\s]+/g) || [];
}

async function processLink(link, message) {
    await handleMovieLink(link, message);
}

function readCsv(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csvParser({ headers: false }))
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results.map(row => ({ title: row[0], watched: row[1] }))))
      .on('error', (error) => reject(error));
  });
}

async function writeCsv(filePath, records) {

  const rows = records.map(record => [record.title, record.watched]);

  const csvContent = rows.map(row => row.join(',')).join('\n');
  await fs.promises.writeFile(filePath, csvContent);
}

function extractExternalId(link) {
    const imdbMatch = link.match(/\/title\/(tt\d+)\//i);
    if (imdbMatch) return imdbMatch[1];

    const rtMatch = link.match(/\/m\/(.+)/i);
    if (rtMatch) return rtMatch[1];

    return null;
}

function extractMovieName(link) {
    const segments = link.split('/');
    return segments[segments.length - 1] || null;
}

async function handleMovieLink(link, message) {
  try {
      let movieTitle;

      if (isImdbLink(link)) {
          const externalId = extractExternalId(link);
          if (!externalId) {
              message.reply('Invalid external ID. Please provide a valid link with IMDb ID.');
              return;
          }
          const tmdbUrl = `https://api.themoviedb.org/3/movie/${externalId}?api_key=${tmdbApiKey}`;
          const response = await axios.get(tmdbUrl);
          console.log('TMDB API Response:', response.data);
          movieTitle = response.data.title;
      } else { 
          if (link.includes('/tv/')) {
              message.reply('TV shows are not supported. Please provide a movie link.');
              return;
          }
          const movieName = extractMovieName(link);
          movieTitle = movieName ? movieName.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase()) : null;
      }

        if (!movieTitle) {
          message.reply('Could not extract a valid movie title from the link.');
          return;
      }
      
      const movies = await readCsv('moviesdb.csv');
      const existingMovie = movies.find(movie => movie.title && movie.title.toLowerCase() === movieTitle.toLowerCase());
      
      if (existingMovie) {
          message.reply(`Movie "${movieTitle}" already exists.`);
          return;
      }
	  
      movies.push({ title: movieTitle, watched: "false" });
      await writeCsv('moviesdb.csv', movies);
      message.reply(`Movie "${movieTitle}" added.`);
  } catch (error) {
      console.error('Error processing movie link:', error);
      message.reply('Error processing the link. Please try again.');
  }
}


async function listRandomMovies(interaction, numberOfMovies = 10, include_watched = false) {
  try {
    const movies = await readCsv('moviesdb.csv');

    let filteredMovies;
    if (include_watched) {
      filteredMovies = movies;
    } else {
      filteredMovies = movies.filter(movie => movie.watched.toLowerCase() === 'false');
    }

    if (!filteredMovies.length) {
      await interaction.reply('No movies found matching your criteria.');
      return;
    }

    const shuffled = filteredMovies.sort(() => 0.5 - Math.random());
    let randomMovies = shuffled.slice(0, numberOfMovies);

    const movieList = randomMovies.map((movie, index) => `${index + 1}. ${movie.title}`).join('\n');

    const csvContent = randomMovies.map(movie => [movie.title].join(',')).join('\n');
    const tempCsvPath = path.join(__dirname, 'random_movies.csv');
    await fs.promises.writeFile(tempCsvPath, csvContent);

    await interaction.reply({
      content: `**Random Movies [${numberOfMovies} movies, Include Watched: ${include_watched}]:**\n${movieList}`,
      files: [tempCsvPath]
    });

    fs.unlink(tempCsvPath, (err) => {
      if (err) throw err;
    });
  } catch (error) {
    console.error('Error retrieving and exporting random movies:', error);
    await interaction.reply('Error retrieving and exporting random movies.');
  }
}

async function setChannel(interaction, channelId) {
    try {
      const configPath = './config.json';
      const configData = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configData);
  
      config.allowedChannelId = channelId;
  
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  
      allowedChannelId = channelId;
      console.log('Allowed channel set to:', channelId);
      await interaction.reply('Movie channel set!');
    } catch (error) {
      console.error('Error updating config.json:', error);
      await interaction.reply('Error updating configuration.');
    }
  }

  async function removeMovie(interaction, titleToRemove) {
    try {
      const movies = await readCsv('moviesdb.csv');
      
      const filteredMovies = movies.filter(movie => movie.title.toLowerCase() !== titleToRemove.toLowerCase());
  
      if (filteredMovies.length < movies.length) {
        const csv = parse(filteredMovies, { header: true });
        fs.writeFileSync('moviesdb.csv', csv);
  
        await interaction.reply(`Movie "${titleToRemove}" removed.`);
      } else {
        await interaction.reply(`Movie "${titleToRemove}" not found.`);
      }
    } catch (error) {
      console.error('Error removing movie.', error);
      await interaction.reply('Error removing movie.');
    }
  }

  async function exportCsv(interaction, include_watched, raw) {
    try {
      if (interaction.channelId !== allowedChannelId) {
        await interaction.reply('This command is only allowed in the specified channel.');
        return;
      }
      const movies = await readCsv(csvFilePath);
  
      if (!movies.length) {
        await interaction.reply('No movies found.');
        return;
      }
  
      const filteredMovies = include_watched ? movies : movies.filter(movie => movie.watched.toLowerCase() === 'false');
  
      const titlesOnly = filteredMovies.map(movie => ([movie.title]));
  
      const csvContent = titlesOnly.map(row => row.join(',')).join('\n');
  
      const tempCsvFileName = include_watched ? 'all_movies.csv' : 'unwatched_movies.csv';
      const tempCsvPath = path.join(__dirname, tempCsvFileName);
  
      if (raw) {
        await interaction.reply({ content: 'CSV Export: Complete Raw Movies Database', files: [csvFilePath] });
        return;
      }

      await fs.promises.writeFile(tempCsvPath, csvContent);
  
      await interaction.reply({ content: `CSV Export: ${include_watched ? 'All Movies' : 'Unwatched Movies'}`, files: [tempCsvPath] });
  
      fs.unlink(tempCsvPath, (err) => {
        if (err) throw err;
        console.log('Temporary CSV file deleted.');
      });
    } catch (error) {
      console.error('Error exporting CSV:', error);
      await interaction.reply('Error exporting CSV.');
    }
  }

  function isImdbLink(link) {
    return link.includes('imdb.com/title/');
}

function isValidLink(url) {
	try {
	  const urlObject = new URL(url);
	  const hostname = urlObject.hostname;
  
	  return (
		(hostname.includes('imdb.com') && url.includes('/title/')) ||
		(hostname.includes('rottentomatoes.com') && url.includes('/m/'))
	  );
	} catch (error) {
	  return false;
	}
  }

  async function toggleWatched(interaction, title) {
    try {
      let movies = await readCsv('moviesdb.csv');
      let found = false;
      let newStatus = '';
      
      movies = movies.map(movie => {
        if (movie.title.toLowerCase() === title.toLowerCase()) {
          found = true;
          const isWatched = movie.watched === 'true';
          newStatus = isWatched ? 'not watched' : 'watched';
          return { title: movie.title, watched: isWatched ? 'false' : 'true' };
        }
        return movie;
      });
  
      if (!found) {
        await interaction.reply(`Movie "${title}" not found.`);
        return;
      }
  
      await writeCsv('moviesdb.csv', movies);
  
      await interaction.reply(`Movie "${title}" set to '${newStatus}'.`);
    } catch (error) {
      console.error('Error toggling watched status:', error);
      await interaction.reply('Error toggling watched status.');
    }
  }
  

client.login(token);