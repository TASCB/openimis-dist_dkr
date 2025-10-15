const fs = require('fs')
const path = require('path')
const { defineConfig } = require("cypress")

const serverFlagPath = path.resolve(__dirname, 'serverStarted')

const payload = {
  "query": "{ moduleConfigurations { module, config, controls { field, usage } } }"
}
const timeoutMinutes = 10
const retryIntervalSeconds = 15

function waitForServerToStart(url) {
  console.log('Waiting for API server to start...')
  return new Promise((resolve, reject) => {
    const startTime = Date.now()

    function checkServer() {
      return fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }).then(response => {
          if (response.status === 200) {
            return resolve()
          } else {
            throw new Error(`Server responded with status ${response.status}`)
          }
        })
        .catch(error => {
          if (Date.now() - startTime >= timeoutMinutes * 60 * 1000) {
            return reject(
              new Error(`Timed out waiting for the server to start: ${error.message}`)
            )
          } else {
            console.log(`${error.message}. Retrying in ${retryIntervalSeconds} seconds...`)
            return setTimeout(checkServer, retryIntervalSeconds * 1000)
          }
        })
    }

    return checkServer()
  })
}

module.exports = defineConfig({
  viewportWidth: 1280,
  viewportHeight: 670,
  e2e: {
    projectId: "q6gc25", // Cypress Cloud, needed for recording
    baseUrl: 'http://localhost',
    defaultCommandTimeout: 15000,
    taskTimeout: timeoutMinutes * 60 * 1000 + 10,
    downloadsFolder: 'cypress/downloads',
    setupNodeEvents(on, config) {
      on('task', {
        checkSetup() {
          return fs.existsSync(serverFlagPath)
        },
        completeSetup() {
          const url = `${config.baseUrl}/api/graphql`
          return waitForServerToStart(url)
            .then(() => {
              console.log('Server is ready!')
              fs.writeFileSync(serverFlagPath, new Date().toString())
              return null
            })
            .catch(error => {
              console.error('Failed to start server:')
              console.error(error.stack);
              return reject(error);
            })
        },
        removeSetupFile() {
          if (fs.existsSync(serverFlagPath)) {
            fs.unlinkSync(serverFlagPath)
          }
          return null
        },
        updateCSV() {
          const fixturePath = path.join(config.fixturesFolder, 'individuals.csv');
          const tmpPath = path.join(config.fixturesFolder, 'tmp_individuals.csv');
          const csv = fs.readFileSync(fixturePath, 'utf8');

          const lines = csv.trim().split('\n');
          const header = lines[0].split(',');
          const groupCodeIdx = header.indexOf('group_code');

          // map old group_code → new group_code
          const groupMap = {};

          const newLines = [lines[0]]; // keep header
          for (let i = 1; i < lines.length; i++) {
            const row = lines[i].split(',');
            const oldCode = row[groupCodeIdx];

            if (!groupMap[oldCode]) {
              groupMap[oldCode] = Math.random().toString(36).substring(2, 8).toUpperCase();
            }

            row[groupCodeIdx] = groupMap[oldCode];
            newLines.push(row.join(','));
          }

          fs.writeFileSync(tmpPath, newLines.join('\n'));
          return null;
        }
      })
    },
  },
})
