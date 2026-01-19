import OpenAI from "openai";

const clamp = (s, max = 3000) => String(s || "").trim().slice(0, max);

export async function generateProposal({ apiKey, projectTitle, projectSnippet, projectUrl, value, prazoDias }) {
  const fallback = () => {
    const v = value ? `R$ ${value}` : "a combinar";
    const p = prazoDias ? `${prazoDias} dias` : "a combinar";
    return `Olá, tudo bem?

Vi o seu projeto “${clamp(projectTitle, 120)}” e posso desenvolver com foco em entrega rápida, layout profissional e boa performance.

Escopo: implementação conforme briefing, responsivo (mobile/desktop), ajustes finos de UX, e entrega com orientações para manutenção.
Valor: ${v}
Prazo: ${p}

Se puder, me confirme: conteúdo (textos/imagens) já está pronto? Há referência visual?

Link do projeto: ${projectUrl}`;
  };

  if (!apiKey) return fallback();

  try {
    const openai = new OpenAI({ apiKey });

    const prompt = `
Gere uma proposta curta e profissional (PT-BR), sem emojis.
Deve incluir:
- Resumo do entendimento
- Como vou executar
- Valor e prazo (editáveis)
- 2 perguntas finais objetivas
- Incluir o link do projeto no final
Limite ~1200 caracteres.

Dados:
Título: ${projectTitle}
Resumo: ${projectSnippet}
Link: ${projectUrl}
Valor: ${value ? `R$ ${value}` : "a combinar"}
Prazo: ${prazoDias ? `${prazoDias} dias` : "a combinar"}
`;

    const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

    const r = await openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.6,
    });

    const text = r.choices?.[0]?.message?.content?.trim();
    return text || fallback();
  } catch {
    return fallback();
  }
}
