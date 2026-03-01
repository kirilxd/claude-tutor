const { spawn } = require('child_process');
const path = require('path');

const PLUGIN_DIR = path.resolve(__dirname, '..', '..', '..');

/**
 * Send an SSE event to the response.
 */
function sendEvent(res, event, data) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  res.write(`event: ${event}\ndata: ${payload}\n\n`);
}

/**
 * Set up SSE headers on a response.
 */
function initSSE(res) {
  if (res.headersSent) return; // idempotent — safe to call multiple times
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
}

/**
 * Spawn claude -p with a prompt, collect all output, then call onComplete(output, res).
 * Sends status events during execution. Handles cleanup on client disconnect.
 */
function streamClaude(res, prompt, { onStatus, onComplete, onError } = {}) {
  initSSE(res);

  if (onStatus) onStatus('Starting Claude...', res);

  const proc = spawn('claude', [
    '-p', prompt,
    '--output-format', 'text',
    '--permission-mode', 'bypassPermissions',
  ], {
    env: { ...process.env, CLAUDECODE: undefined },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  let killed = false;

  proc.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });

  proc.stderr.on('data', (chunk) => {
    // Claude CLI progress goes to stderr — use as status
    const msg = chunk.toString().trim();
    if (msg && onStatus) onStatus(msg, res);
  });

  proc.on('close', (code) => {
    if (killed) return;
    if (code !== 0 && !output.trim()) {
      const errMsg = `Claude exited with code ${code}`;
      if (onError) onError(errMsg, res);
      else sendEvent(res, 'error', errMsg);
      res.end();
      return;
    }
    if (onComplete) {
      try {
        onComplete(output, res);
      } catch (e) {
        sendEvent(res, 'error', e.message);
      }
    }
    sendEvent(res, 'done', {});
    res.end();
  });

  proc.on('error', (err) => {
    if (killed) return;
    if (onError) onError(err.message, res);
    else sendEvent(res, 'error', err.message);
    res.end();
  });

  // Clean up on client disconnect
  res.on('close', () => {
    killed = true;
    proc.kill();
  });

  return proc;
}

/**
 * Extract a JSON object or array from Claude's text output.
 * Claude often wraps JSON in markdown code blocks.
 */
function extractJSON(text) {
  // Try to find JSON in code blocks first
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1].trim()); } catch (e) {}
  }
  // Try to find raw JSON (array or object)
  const match = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (match) {
    try { return JSON.parse(match[1]); } catch (e) {}
  }
  return null;
}

module.exports = { sendEvent, initSSE, streamClaude, extractJSON, PLUGIN_DIR };
