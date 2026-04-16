import fs from 'fs'
import path from 'path'
import { app } from 'electron'

let logPath: string | null = null

function getLogPath() {
  if (!logPath) {
    const logDir = app.getPath('logs')
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })
    logPath = path.join(logDir, 'helper.log')
  }
  return logPath
}

function formatEntry(level: string, message: string, data?: unknown) {
  const ts = new Date().toISOString()
  let line = `[${ts}] [${level}] ${message}`
  if (data !== undefined) {
    line += ' ' + (data instanceof Error ? `${data.message}\n${data.stack}` : JSON.stringify(data))
  }
  return line + '\n'
}

export const logger = {
  info(message: string, data?: unknown) {
    const entry = formatEntry('INFO', message, data)
    process.stdout.write(entry)
    fs.appendFileSync(getLogPath(), entry)
  },

  error(message: string, data?: unknown) {
    const entry = formatEntry('ERROR', message, data)
    process.stderr.write(entry)
    fs.appendFileSync(getLogPath(), entry)
  },

  warn(message: string, data?: unknown) {
    const entry = formatEntry('WARN', message, data)
    process.stdout.write(entry)
    fs.appendFileSync(getLogPath(), entry)
  },

  getLogPath() {
    return getLogPath()
  },
}
