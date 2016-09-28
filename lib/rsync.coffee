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
_ = require('lodash')
rsync = require('rsync')
settings = require('resin-settings-client')
utils = require('./utils')

###*
# @summary Get --rsh SSH command for rsync
# @function
# @protected
#
# @param {Object} [options] - options
# @param {String} [options.username] - username
# @param {String} [options.host] - host
# @param {Number} [options.port] - resin ssh gateway port
# @param {String} [options.'remote-cmd'] - remote ssh command
# @param {Boolean} [options.verbose] - verbose output
#
# @returns {String} ssh command
#
# @example
# ssh.getConnectCommand
#		username: 'test'
# 	uuid: '1234'
# 	containerId: '4567'
# 	command: 'date'
###
buildRshOption = (options = {}) ->

	utils.validateObject options,
		properties:
			username:
				description: 'username'
				type: 'string'
				required: true
			host:
				description: 'host'
				type: 'string'
				required: true
			port:
				description: 'port'
				type: 'number'
				required: true
			'remote-cmd':
				description: 'remote-cmd'
				type: 'string'
				required: false
			verbose:
				description: 'verbose'
				type: 'boolean'

	verbose = if options.verbose then '-vv ' else ''
	remoteCmd = options['remote-cmd'] ? ''

	result = """
		ssh \
		#{verbose}\
		-p #{options.port} \
		-o LogLevel=ERROR \
		-o StrictHostKeyChecking=no \
		-o UserKnownHostsFile=/dev/null \
		-o ControlMaster=no \
		#{options.username}@#{options.host} \
		#{remoteCmd}
	"""

	return result
###*
# @summary Build rsync command
# @function
# @protected
#
# @param {Object} options - rsync options
# @param {String} options.username - username
# @param {Boolean} [options.progress] - show progress
# @param {String|String[]} [options.ignore] - pattern/s to ignore. Note that '.gitignore' is always used as a filter if it exists
# @param {Boolean} [options.verbose] - verbose output
# @param {Boolean} [options.skip-gitignore] - skip gitignore
# @param {String} options.source - source directory on local machine
# @param {String} options.destination - destination directory on device
#
# @returns {String} rsync command
#
# @example
# command = rsync.buildRsyncCommand
#		username: 'user',
#		source: '/home/uer/app',
#		destination: '/usr/src/app'
###
exports.buildRsyncCommand = (options = {}) ->

	utils.validateObject options,
		properties:
			username:
				description: 'username'
				type: 'string'
				required: true
				messages:
					type: 'Not a string: username'
					required: 'Missing username'
			progress:
				description: 'progress'
				type: 'boolean'
				message: 'Not a boolean: progress'
			ignore:
				description: 'ignore'
				type: [ 'string', 'array' ]
				message: 'Not a string or array: ignore'
			'skip-gitignore':
				description: 'skip-gitignore'
				type: 'boolean'
				message: 'Not a boolean: skip-gitignore'
			verbose:
				description: 'verbose'
				type: 'boolean'
				message: 'Not a boolean: verbose'
			source:
				description: 'source'
				type: 'any'
				required: true
				message: 'Not a string: source'
			destination:
				description: 'destination'
				type: 'any'
				required: true
				message: 'Not a string: destination'

	args =
		source: '.'
		destination: "#{options.username}@ssh.#{settings.get('proxyUrl')}:#{options.destination}"
		progress: options.progress
		shell: buildRshOption(options)

		# a = archive mode.
		# This makes sure rsync synchronizes the
		# files, and not just copies them blindly.
		#
		# z = compress during transfer
		# v = increase verbosity
		flags:
			'a': true
			'z': true
			'v': options.verbose

	rsyncCmd = rsync.build(args).delete()

	if not options['skip-gitignore']
		try
			patterns = utils.gitignoreToRsyncPatterns(path.join(options.source, '.gitignore'))

			# rsync 'include' options MUST be set before 'exclude's
			rsyncCmd.include(patterns.include)
			rsyncCmd.exclude(patterns.exclude)

	# For some reason, adding `exclude: undefined` adds an `--exclude`
	# with nothing in it right before the source, which makes rsync
	# think that we want to ignore the source instead of transfer it.
	if options.ignore?
		# Only exclude files that have not already been exlcuded to avoid passing
		# identical '--exclude' options
		gitignoreExclude = patterns?.exclude ? []
		rsyncCmd.exclude(_.difference(options.ignore, gitignoreExclude))

	result = rsyncCmd.command()

	# Workaround to the fact that node-rsync duplicates
	# backslashes on Windows for some reason.
	result = result.replace(/\\\\/g, '\\')

	console.log("rsync command: #{result}") if options.verbose

	return result
