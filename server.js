require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TOPIC_CONTEXT = {
  'Consumer Behavior': `
    Consumer Decision Process (5 steps: problem recognition, information search, alternative evaluation,
    outlet selection, postpurchase behavior). Internal influences: perception (selective exposure, selective
    attention, selective distortion, selective retention, JND/Weber's Law), learning (classical conditioning,
    operant conditioning), Maslow's hierarchy of needs (physiological, safety, social, esteem, self-actualization),
    attitudes (cognitive/affective/behavioral components, ABC model). External influences: culture, subcultures,
    reference groups (informational, normative, identification), family roles (initiator, influencer, decider,
    purchaser, user). Evoked set, involvement levels (high vs low), cognitive dissonance, hedonic vs utilitarian needs.
  `,
  'Product Management': `
    4 service characteristics: intangibility, inseparability, heterogeneity (fix = training), perishability
    (fix = capacity management). Product line depth and reasons companies decrease it (reduce consumer confusion,
    save shelf space, simplify supply chain, reduce manufacturing complexity, focus on high-margin products).
    Product mix width, SKU, cannibalization. Product life cycle stages: introduction, growth, maturity, decline.
    New product development 7 stages: strategy → idea generation → idea screening → business analysis →
    development → test marketing → commercialization. Brand equity components (awareness, associations,
    perceived quality, loyalty). Packaging functions (protection, communication, convenience, promotion).
  `,
  'Marketing Research': `
    6-step research process: define problem → develop plan → collect data → analyze data → present findings →
    make decision. Primary vs secondary research. Qualitative methods: focus groups (8-12 people), depth interviews,
    ethnography. Quantitative methods: surveys, experiments. McDonald's All-Day Breakfast case study (symptoms:
    declining sales + increased wait times; management assumption: menu fatigue; research via surveys/focus groups/
    ethnography found operational inefficiencies; fix: scaled back ADB + streamlined kitchen; result: stable sales
    + improved customer satisfaction). Probability sampling (random, stratified, cluster) vs non-probability
    (convenience, judgment, quota, snowball). Measurement scales: nominal, ordinal, interval, ratio.
    Validity vs reliability. A/B testing, perceptual mapping, conjoint analysis.
  `
};

app.post('/api/quiz', async (req, res) => {
  const { topic, difficulty, count } = req.body;

  if (!topic || !difficulty || !count) {
    return res.status(400).json({ error: 'Missing required fields: topic, difficulty, count' });
  }

  const numQuestions = Math.min(Math.max(parseInt(count), 3), 15);

  let topicContext = '';
  if (topic === 'All Topics') {
    topicContext = Object.entries(TOPIC_CONTEXT)
      .map(([k, v]) => `## ${k}\n${v}`)
      .join('\n\n');
  } else {
    topicContext = TOPIC_CONTEXT[topic] || '';
  }

  const difficultyGuide = {
    Easy: 'straightforward recall and basic comprehension. Focus on definitions and core concepts a student would know after one read-through.',
    Medium: 'application and analysis. Students must apply concepts to scenarios or compare/contrast related ideas. Include plausible distractors.',
    Hard: 'synthesis and evaluation. Multi-step reasoning, nuanced distinctions, complex scenarios where multiple answers seem plausible but only one is correct.'
  };

  const prompt = `You are a university marketing professor writing a ${difficulty} difficulty multiple-choice exam.

Course content:
${topicContext}

Write exactly ${numQuestions} multiple-choice questions at ${difficulty} difficulty (${difficultyGuide[difficulty]}).

Rules:
- Each question has exactly 4 choices: A, B, C, D
- Exactly one correct answer per question
- Include a 1-2 sentence explanation of why the correct answer is right
- Do not write trick questions or questions about trivial details
${topic === 'All Topics' ? '- Distribute questions evenly across Consumer Behavior, Product Management, and Marketing Research' : `- All questions must relate to ${topic}`}

Respond with ONLY a valid JSON object — no markdown, no code fences, no extra text:
{
  "questions": [
    {
      "question": "Question text?",
      "choices": { "A": "...", "B": "...", "C": "...", "D": "..." },
      "correct": "A",
      "explanation": "A is correct because...",
      "topic": "Consumer Behavior"
    }
  ]
}`;

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }]
    });

    let raw = message.content[0].text.trim();

    // Strip markdown code fences if the model wraps anyway
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) raw = fenced[1].trim();

    const parsed = JSON.parse(raw);
    if (!parsed.questions || !Array.isArray(parsed.questions)) {
      throw new Error('Unexpected response structure');
    }

    res.json(parsed);
  } catch (err) {
    console.error('Quiz generation error:', err.message);
    const status = err instanceof SyntaxError ? 502 : 500;
    res.status(status).json({ error: err.message || 'Failed to generate quiz' });
  }
});

// Fallback: serve the SPA for any unmatched route
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Marketing Exam Prep running → http://localhost:${PORT}`);
});
