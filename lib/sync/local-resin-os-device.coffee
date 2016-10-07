###
Copyright 2016 Resin.io

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

	 http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
###

path = require('path')
Promise = require('bluebird')
_ = require('lodash')
shellwords = require('shellwords')
shell = require('../shell')
{ buildRsyncCommand } = require('../rsync')
{ spinnerPromise
	startContainerSpinner
	stopContainerSpinner
	startContainerAfterErrorSpinner
} = require('../utils')
{ dockerInit, startContainer, stopContainer } = require('../docker-utils')

DEVICE_SSH_PORT = 22222

exports.sync = (syncOptions, deviceIp) ->

	{ source, destination, before, after, local_resinos: 'app-name': appName } = syncOptions

	throw new Error("'destination' is a required sync option") if not destination?
	throw new Error("'deviceIp' is a required sync option") if not deviceIp?
	throw new Error("'app-name' is a required sync option") if not appName?

	syncContainer = (appName, destination, host, port = DEVICE_SSH_PORT) ->
		docker = dockerInit(deviceIp)

		docker.containerRootDir(appName, host, port)
		.then (containerRootDirLocation) ->

			rsyncDestination = path.join(containerRootDirLocation, destination)

			_.assign syncOptions,
						username: 'root'
						host: host
						port: port
						destination: shellwords.escape(rsyncDestination)

			command = buildRsyncCommand(syncOptions)

			spinnerPromise(
				shell.runCommand(command, cwd: source)
				"Syncing to #{destination} on '#{appName}'..."
				"Synced #{destination} on '#{appName}'."
			)

	Promise.try ->
		if before?
			shell.runCommand(before, source)
	.then -> # stop container
		stopContainerSpinner(stopContainer(appName))
	.then -> # sync container
		syncContainer(appName, destination, deviceIp)
		.then -> # start container
			startContainerSpinner(startContainer(appName))
		.then -> # run 'after' action
			if after?
				shell.runCommand(after, source)
		.catch (err) ->
			# Notify the user of the error and run 'startApplication()'
			# once again to make sure that a new app container will be started
			startContainerAfterErrorSpinner(startContainer(appName))
			.catch (err) ->
				console.log('Could not start application container', err)
			.finally ->
				throw err
