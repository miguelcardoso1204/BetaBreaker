---
name: explain
description: Answer questions about the Beta Breaker project, its technologies, or its architecture in simple ELI5 terms
---

## When to Use
When the user invokes `/explain` followed by a question about the Beta Breaker project, its technologies, or its architecture.

## Instructions

1. Read the question provided after `/explain`.
2. Answer it in an **ELI5 (Explain Like I'm 5)** style — simple analogies, short sentences, no jargon without explanation. The user is a CS student learning these technologies, so make concepts click rather than just listing facts.
3. After answering, append both the question and your answer to `docs/understanding_the_project.md` under a `## Q&A` section. Each entry should use this format:

```markdown
### Q: <the question>
<your answer>
```

4. If the `## Q&A` heading doesn't exist yet in the file, create it.
5. Keep answers concise — aim for 3-8 sentences unless the topic genuinely needs more.
