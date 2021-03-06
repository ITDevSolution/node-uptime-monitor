require('dotenv').config()

const request = require('request')
const services = require('./services.js') // list of services to monitor

const pingService = (url, cb) => {
  request({
    method: 'GET',
    uri: url,
    time: true
  }, (err, res, body) => {
    if (!err && res.statusCode == 200) {
      // we'll use the time from the point we try to establish a connection with
      // the service until the first byte is received
      cb(res.timingPhases.firstByte)
    } else {
      cb('OUTAGE')
    }
  })
}

const pingInterval = 5*1000*60 // 5 minutes
let serviceStatus = {}

services.forEach(service => {
  serviceStatus[service.url] = {
    status: 'OPERATIONAL', // initialize all services as operational when we start
    responseTimes: [], // array containing the responses times for last 3 pings
    timeout: service.timeout // load up the timout from the config
  }

  setInterval(() => {
    pingService(service.url, (serviceResponse) => {
      if (serviceResponse === 'OUTAGE' && serviceStatus[service.url].status !== 'OUTAGE') {
        // only update and post to Slack on state change
        serviceStatus[service.url].status = 'OUTAGE'
        postToSlack(service.url)
      } else {
        let responseTimes = serviceStatus[service.url].responseTimes
        responseTimes.push(serviceResponse)

        // check degraded performance if we have 3 responses so we can average them
        if (responseTimes.length > 3) {
          // remove the oldest response time (beginning of array)
          responseTimes.shift()

          // compute average of last 3 response times
          let avgResTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
          let currService = serviceStatus[service.url]

          if (avgResTime > currService.timeout && currService.status !== 'DEGRADED') {
            currService.status = 'DEGRADED'
            postToSlack(service.url)
          } else if (avgResTime < currService.timeout && currService.status !== 'OPERATIONAL') {
            currService.status = 'OPERATIONAL'
            postToSlack(service.url)
          }
        }

      }
    })
  }, pingInterval)
})

const postToSlack = (serviceUrl) => {
  let slackPayload = {
    text: `*Service ${serviceStatus[serviceUrl].status}*\n${serviceUrl}`
  }

  request({
    method: 'POST',
    uri: process.env.SLACK_WEBHOOK_URL,
    body: slackPayload,
    json: true
  }, (err, res, body) => {
    if (err) console.log(`Error posting to Slack: ${err}`)
  })
}
