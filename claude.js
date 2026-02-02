// Claude API calls — copied from papertrail-copilot/services/aiService.ts

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

function getApiKey() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  return key;
}

async function callClaude(messages, maxTokens = 2048) {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const msg = errorData?.error?.message || `API error: ${response.status}`;
    const err = new Error(msg);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  return data.content[0].text;
}

// Analyze a document image — same prompt as aiService.ts
async function analyzeDocument(base64Image, mimeType) {
  const messages = [
    {
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mimeType,
            data: base64Image,
          },
        },
        {
          type: 'text',
          text: `Analyze this document image and extract actionable tasks. This could be a bill, form, letter, receipt, or any paperwork.

IMPORTANT: First, check if the image is clear and readable. If the image is blurry, dark, cut off, or otherwise difficult to read clearly, return this special error task:
[{
  "title": "⚠️ Image Quality Issue - Please Retake Photo",
  "description": "The image appears to be [blurry/dark/cut off/unclear]. Please retake the photo with better lighting and focus.",
  "due_date": null,
  "priority": "high",
  "tags": [],
  "ai_summary": "I couldn't read this document clearly. Try these tips: 1) Use good lighting, 2) Hold camera steady, 3) Make sure entire document is visible, 4) Avoid shadows or glare.",
  "needs_retake": true
}]

If the image IS clear and readable, look for:
- What needs to be done (pay bill, fill form, respond to letter, etc.)
- Any deadlines or due dates
- Important amounts or details
- Priority level based on urgency
- Appropriate tags based on document type and content

TAGS: Intelligently assign one or more tags from this list based on the document content:
- "work" - Work-related documents, professional correspondence
- "personal" - Personal matters, non-work items
- "bills" - Bills, invoices, payment due
- "medical" - Medical records, prescriptions, health insurance
- "legal" - Legal documents, contracts, official forms
- "finance" - Financial documents, bank statements, tax forms
- "home" - Home maintenance, utilities, property related
- "auto" - Car-related, vehicle maintenance, insurance

Return a JSON array of tasks with this EXACT format:
[{
  "title": "Brief, clear task title (e.g., 'Pay Electric Bill')",
  "description": "Key details like amounts, dates, account numbers",
  "due_date": timestamp_in_milliseconds_or_null,
  "priority": "high" | "medium" | "low",
  "tags": ["tag1", "tag2"],
  "ai_summary": "Helpful context about this task and how to complete it",
  "needs_retake": false
}]

Rules:
- If you see a due date, convert it to milliseconds timestamp
- If no due date is visible, use null
- Priority: high for bills/urgent items, medium for forms, low for FYI items
- Tags: Assign 1-3 relevant tags based on content (e.g., electric bill gets ["bills", "home"])
- Be specific in descriptions (include amounts, dates, account numbers)
- Keep title under 60 characters
- Return ONLY valid JSON, no markdown or explanation

If the document has multiple tasks (e.g., bill with multiple line items), create separate tasks for each.`,
        },
      ],
    },
  ];

  const content = await callClaude(messages, 2048);

  // Parse JSON (remove markdown fences if present)
  const cleanContent = content
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  const tasks = JSON.parse(cleanContent);

  if (Array.isArray(tasks) && tasks.length > 0) {
    return tasks;
  }

  return [{
    title: 'Unable to Process Document',
    description: 'The AI could not extract tasks from this document.',
    due_date: null,
    priority: 'medium',
    ai_summary: 'Please try taking another photo with better lighting and clarity.',
    needs_retake: true,
  }];
}

// Generate a draft — same prompt as aiService.ts
async function generateDraft(task, draftType) {
  const draftTypeInstructions = {
    email: 'Write a professional email responding to this task. Include a clear subject line, appropriate greeting, body, and closing.',
    letter: 'Write a formal letter addressing this task. Include proper formatting with date, address, salutation, body paragraphs, and signature line.',
    form: 'Write text to fill out a form related to this task. Provide clear, concise responses that would work in form fields.',
    appeal: 'Write a persuasive appeal or request letter for this task. Be professional but assertive, clearly state the issue and desired resolution.',
  };

  const instruction = draftTypeInstructions[draftType];
  if (!instruction) {
    throw new Error(`Invalid draft type: ${draftType}`);
  }

  const messages = [
    {
      role: 'user',
      content: `I need help with this task:

Task: ${task.title}
Description: ${task.description || 'No additional details'}
${task.ai_summary ? `Context: ${task.ai_summary}` : ''}
${task.due_date ? `Due Date: ${new Date(task.due_date).toLocaleDateString()}` : ''}

${instruction}

Important guidelines:
- Be professional and courteous
- Be specific and reference details from the task
- Keep it concise and clear
- Use proper formatting
- Do not include placeholder text like [Your Name] - just write the content
- For emails, start with "Subject:" then the email body
- Make it ready to send/use

Write the ${draftType} now:`,
    },
  ];

  const content = await callClaude(messages, 1024);
  return content.trim();
}

module.exports = { analyzeDocument, generateDraft };
