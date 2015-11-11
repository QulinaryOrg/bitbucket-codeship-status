module.exports = function () {
	var express = require('express');
  var expressValidator = require('express-validator');
	var bodyParser = require('body-parser');
	var Request = require('request');
	var basicAuth = require('basic-auth-connect');
	var app = express();

	app.use('/media', express.static(__dirname + '/media'));
	app.use(bodyParser.json());
	app.use(expressValidator());
	app.set('view engine', 'ejs');
	app.enable('trust proxy');

	app.get('/', function (req, res) {
		Request({
			url: 'https://' + process.env.BITBUCKET_USERNAME + ':' + process.env.BITBUCKET_PASSWORD + '@api.bitbucket.org/2.0/users/chesleybrown',
			method: 'GET'
		}, function (err, response, body) {
			res.render('index', {
				BITBUCKET_USERNAME: process.env.BITBUCKET_USERNAME,
				BITBUCKET_PASSWORD: Boolean(process.env.BITBUCKET_PASSWORD),
				ssl: (req.protocol === 'https') ? true : false,
				host: req.get('host'),
				authenticated: (err || response.statusCode !== 200) ? false : true
			});
		});
	});

	app.post('/pull-request/:codeshipProjectUuid/:codeshipProjectId', basicAuth(function (username, password) {
		return (username === process.env.BITBUCKET_USERNAME && password === process.env.BITBUCKET_PASSWORD);
	}), function (req, res) {
		var errors, pullRequest;

		// verify params
		req.checkParams('codeshipProjectUuid', 'Invalid codeship project UUID').notEmpty().isUUID();
		req.checkParams('codeshipProjectId', 'Invalid codeship project ID').notEmpty().isInt();

		// verify body
   	req.checkBody('pullrequest.id', 'Unexpected BitBucket API response: pullrequest.id property is required').notEmpty().isInt();
   	req.checkBody('pullrequest.source.branch.name', 'Unexpected BitBucket API response: pullrequest.source.branch.name property is required').notEmpty();
   	req.checkBody('pullrequest.source.repository.full_name', 'Unexpected BitBucket API response: pullrequest.source.repository.full_name is required').notEmpty();

		errors = req.validationErrors();
	  if (errors) {
			console.error('Invalid codeship payload:', errors);
	    res.status(400).send(errors);
	    return;
	  }

		pullRequest = req.body.pullrequest;

		// if it doesn't already have Codeship status at the start of the description, let's add it
		if (pullRequest.description.indexOf('[ ![Codeship Status') === 0) {
			console.log('Codeship status already in description');
			res.status(204).end();
			return;
		}

		var widget = '[ ![Codeship Status for ' + pullRequest.source.repository.full_name +
			'](https://codeship.io/projects/' + req.params.codeshipProjectUuid +'/status?branch=' +
			pullRequest.source.branch.name + ')](https://codeship.io/projects/' + req.params.codeshipProjectId + ')';
		pullRequest.description = widget + '\r\n\r\n' + pullRequest.description;

		Request({
			url: 'https://' + process.env.BITBUCKET_USERNAME + ':' + process.env.BITBUCKET_PASSWORD +
				'@api.bitbucket.org/2.0/repositories/' + pullRequest.source.repository.full_name + '/pullrequests/' + pullRequest.id,
			method: 'PUT',
			json: pullRequest
		}, function (err, response, body) {
			if (err) {
				console.error('Error while adding codeship status to pull request:', err);
				res.status(500).end();
				return;
			}

			if (response.body && response.body.error) {
				console.error('Unexpected error while adding codeship status to pull request:', request.body.error);
				res.status(500).end();
				return;
			}

			console.log('Successfully added codeship status to description');
			res.status(204).end();
		});
	});

	return app;
};