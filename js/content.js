/* Aser's Road: portfolio content. Edit this file to change the words on the road and on the normal website. */
'use strict';

/* =====================================================================
   CONTENT — edit this object. Both the 3D road and the normal website
   read from it. Everything marked "placeholder" is meant to be replaced.
   ===================================================================== */
const CONTENT = {
  name: 'Aser Chala',
  hello: 'Hello, my name is',
  tagline: 'Full-stack developer · AI agents · Blockchain developer',
  intro: 'I’m an ML intern at Flyrank, an AI SEO company, and I build software in Addis Ababa. This site is a road I made, so drive down it. If something catches your eye, say hello at the end.',
  works: [
    { kind: 'AI agent', title: 'AI Customer Support Agent', desc: 'A LangChain support agent that reads customer emails over IMAP, drafts answers, and replies over SMTP.', tags: ['Python', 'LangChain', 'IMAP / SMTP', 'uv'] },
    { kind: 'AI agents', title: 'Multi-Agent Triage System', desc: 'A locally run customer support system where several agents sort and route requests. It includes Amharic text-to-speech.', tags: ['Python', 'LangGraph', 'Transformers', 'VITS / MMS'] },
    { kind: 'Full-stack', title: 'DMC Real Estate', desc: 'A real estate marketplace with a React client and an Express and MongoDB server.', tags: ['React', 'Express', 'MongoDB'] },
    { kind: 'Android', title: 'Daily Planner', desc: 'A commitment tracker with alarms, notifications, completion tracking, and one to two months of progress analytics.', tags: ['Android', 'Notifications', 'Analytics'] },
    { kind: 'AI agent', title: 'Web Research Agent', desc: 'A tool-calling agent loop that searches the web and reads pages to answer research questions.', tags: ['Python', 'Tool calling', 'web_search', 'read_page'] },
    { kind: 'Blockchain', title: 'Foundry Lottery with React', desc: 'A decentralized lottery that holds 10 players, picks one winner and sends them the pot. When the pot is paid out, it starts a new round and never stops.', tags: ['Solidity', 'Python', 'JavaScript', 'HTML'] }
  ],
  experience: [
    { years: 'Oct 2026 — Present', role: 'Machine Learning Internship', org: 'FlyRank AI · Internship', place: 'Addis Ababa, Ethiopia · Remote', desc: 'Currently interning at FlyRank AI as an AI intern, focusing on Machine Learning.' },
    { years: 'Aug 2026 — Oct 2026', role: 'Syntax Software Solution', org: 'Freelance', place: 'Addis Ababa, Ethiopia · Remote', desc: '' },
    { years: 'Jun 2026 — Aug 2026', role: 'Web Developer and AI agents', org: 'For personal clients', place: 'Addis Ababa, Ethiopia · Remote', desc: '' }
  ],
  about: {
    story: [
      'I finished a Bachelor’s degree in Software Engineering and I spend my time between full-stack web work and AI agent projects. I like backends that are simple to reason about and interfaces that stay out of the way.',
      'I’m also exploring Artificial Intelligence, AI agents, Large Language Models (LLMs), and Retrieval-Augmented Generation (RAG) to build smarter applications that solve real-world problems. I enjoy learning new technologies, solving challenging problems, and continuously improving my development skills. My goal is to build impactful software that combines clean design, efficient engineering, and intelligent automation to create meaningful value for users and businesses.'
    ],
    roadStory: [
      'I finished a Bachelor’s degree in Software Engineering. I split my time between full-stack web work and AI agent projects.',
      'I’m exploring AI agents, LLMs and RAG to build smarter apps that solve real problems, with clean design and efficient engineering.'
    ],
    skillGroups: [
      { name: 'Languages', items: ['Python', 'TypeScript', 'JavaScript', 'Java', 'Dart', 'Solidity'] },
      { name: 'Web & mobile', items: ['React', 'Next.js', 'Flutter', 'Android'] },
      { name: 'Backend & data', items: ['Node.js', 'Express', 'Spring Boot', 'MongoDB'] },
      { name: 'AI', items: ['LangChain', 'LangGraph', 'Tool-calling agents', 'Local models'] },
      { name: 'Blockchain', items: ['Solidity', 'Smart contracts', 'Web3.js', 'Ethers.js'] }
    ],
    facts: ['Based in Addis Ababa', 'Bachelor’s in Software Engineering', 'Speaks more than one language']
  },
  contact: {
    cta: 'Have a project in mind? Let’s talk.',
    email: 'asherchala123@gmail.com',
    phone: '+251966217119',
    links: [{ label: 'GitHub', value: 'github.com/ras7961' }, { label: 'LinkedIn', value: 'linkedin.com/in/aser-chala-154999280' }]
  }
};
