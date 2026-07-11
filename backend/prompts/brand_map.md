BRAND MAP PROMPT™
You are an AI assistant tasked with creating a comprehensive Brand Map by extracting
important business and branding information from an onboarding transcript. This Brand Map will
serve as a knowledge base for future AI prompts in an AI-driven personal branding system. Your
goal is to produce a detailed and accurate representation of the client's business, offers, vision,
goals, and branding-related information.
Here's the onboarding quiz questions to understand the context of the client's responses:
<onboarding_quiz>
{{ONBOARDING
_
QUIZ}}
</onboarding_quiz>
Now, here's the transcript of the client's responses:
<transcript>
{{TRANSCRIPT}}
</transcript>
Your task is to analyze the transcript in relation to the onboarding quiz questions and extract
relevant information for the Brand Map. Wrap your analysis inside <brand
_
map_
analysis> tags
to break down your thought process for each main section before compiling the final Brand Map.
For each of the following sections:
1. Business Information
2. Offers
3. Vision and Goals
4. Branding
5. Personal Brand Elements
Please follow these steps:
a) List relevant quotes from the transcript
b) Interpret these quotes in the context of the section
c) Summarize the key points to be included in the final Brand Map
Focus on extracting the following information:
1. Business Information:
- Company name
- Industry or niche
- Target audience
- Unique selling proposition (USP)
- Current situation
- Challenges faced in business
- Core principles and values of the business
- Problem the business solves in the market
- Real mission behind the business
- Current revenue and revenue sources
- USPs over competitors
- Unique traits or practices of business over competitors
- Current team or employee setup
- Biggest business bottlenecks at the moment
2. Offers:
- Products or services offered
- Pricing structure (if mentioned)
- Key features or benefits of each offer
3. Vision and Goals:
- Short-term business goals
- Long-term vision for the company
- Any specific milestones or targets mentioned
4. Branding:
- Brand values
- Brand personality traits
- Visual branding elements (if mentioned)
- Brand voice or communication style
5. Personal Brand Elements:
- Brief background of the business owner
- Relevant expertise or qualifications
- Personal values that align with the brand
As you extract this information, ensure that you:
- Provide detailed and elaborate descriptions for each point
- Include only information explicitly stated or strongly implied in the transcript
- Do not make assumptions or add information not present in the source material
- If certain information is unclear or not provided, note this in your output
After your analysis, compile the extracted information into a structured Brand Map using the
following format:
<brand
_
map>
1. Business Information:
[Detailed extracted information for each sub-point]
2. Offers:
[Detailed extracted information for each sub-point]
3. Vision and Goals:
[Detailed extracted information for each sub-point]
4. Branding:
[Detailed extracted information for each sub-point]
5. Personal Brand Elements:
[Detailed extracted information for each sub-point]
</brand
_
map>
Name your output file as follows: <client
_
name>{{CLIENT
_
NAME}}</client
_
name> - Brand Map
Remember, the quality and accuracy of this Brand Map are crucial as it will be used as a
foundation for future AI prompts in the personal branding system. If you encounter any
ambiguities or need clarification on any point, indicate this clearly in your output.
