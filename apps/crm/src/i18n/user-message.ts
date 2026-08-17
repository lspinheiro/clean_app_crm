import type { AppLocale } from "./config";

const ptBrMessages: Record<string, string> = {
  "Check this row and try again.": "Verifique esta linha e tente novamente.",
  "Enter a company name.": "Insira o nome da empresa.",
  "Enter a client name.": "Insira o nome do cliente.",
  "Enter a site name.": "Insira o nome do local.",
  "Enter a street address.": "Insira o endereço.",
  "Enter a suburb.": "Insira o subúrbio.",
  "Enter exactly 11 digits.": "Insira exatamente 11 dígitos.",
  "Use 40 characters or fewer.": "Use no máximo 40 caracteres.",
  "Use 120 characters or fewer.": "Use no máximo 120 caracteres.",
  "Use 240 characters or fewer.": "Use no máximo 240 caracteres.",
  "Use 2,000 characters or fewer.": "Use no máximo 2.000 caracteres.",
  "Choose a client.": "Selecione um cliente.",
  "Choose a valid client.": "Selecione um cliente válido.",
  "Choose a site.": "Selecione um local.",
  "Choose a valid site.": "Selecione um local válido.",
  "Choose a service.": "Selecione um serviço.",
  "Choose a default service.": "Selecione um serviço padrão.",
  "Choose a valid job date.": "Selecione uma data válida para o serviço.",
  "Choose a valid first service date.": "Selecione uma primeira data de serviço válida.",
  "Choose a valid start time.": "Selecione um horário de início válido.",
  "Choose a valid recurring assignment.": "Selecione uma programação recorrente válida.",
  "Choose a valid assignment before trying again.": "Selecione uma alocação válida antes de tentar novamente.",
  "Choose cleaners from the active pool.": "Selecione profissionais do banco ativo.",
  "Enter a valid duration.": "Insira uma duração válida.",
  "Enter a duration greater than zero.": "Insira uma duração maior que zero.",
  "Enter a duration of at least one minute.": "Insira uma duração de pelo menos um minuto.",
  "Use a duration of 24 hours or less.": "Use uma duração de no máximo 24 horas.",
  "Enter a valid AUD amount with up to two decimals.": "Insira um valor em AUD válido com até duas casas decimais.",
  "Enter cleaner pay greater than zero.": "Insira um pagamento do profissional maior que zero.",
  "Enter a client charge greater than zero.": "Insira um valor cobrado do cliente maior que zero.",
  "Enter a rate greater than zero.": "Insira um valor maior que zero.",
  "Crew size must be a whole number.": "O tamanho da equipe deve ser um número inteiro.",
  "Crew size must be at least one.": "O tamanho da equipe deve ser de pelo menos um.",
  "Crew size must be 20 or fewer.": "O tamanho da equipe deve ser de no máximo 20.",
  "Fill named cleaner slots in order.": "Preencha em ordem as posições com profissionais definidos.",
  "Named cleaners cannot exceed crew size.": "A quantidade de profissionais definidos não pode exceder o tamanho da equipe.",
  "Choose each named cleaner only once.": "Selecione cada profissional definido apenas uma vez.",
  "Cleaner order cannot contain duplicates.": "A ordem dos profissionais não pode conter duplicatas.",
  "The cleaner order is invalid.": "A ordem dos profissionais é inválida.",
  "The client could not be created. Please try again.": "Não foi possível criar o cliente. Tente novamente.",
  "The site could not be created. Please try again.": "Não foi possível criar o local. Tente novamente.",
  "The client could not be saved. Please try again.": "Não foi possível salvar o cliente. Tente novamente.",
  "The site could not be saved. Please try again.": "Não foi possível salvar o local. Tente novamente.",
  "The preferred cleaner order could not be saved. Please try again.": "Não foi possível salvar a ordem de profissionais preferenciais. Tente novamente.",
  "The recurring assignment could not be saved. Please try again.": "Não foi possível salvar a programação recorrente. Tente novamente.",
  "The recurring assignment status could not be saved. Please try again.": "Não foi possível salvar o status da programação recorrente. Tente novamente.",
  "The job could not be saved. Please try again.": "Não foi possível salvar o serviço. Tente novamente.",
  "The save could not be confirmed. Refresh Jobs before trying again.": "Não foi possível confirmar o salvamento. Atualize Serviços antes de tentar novamente.",
  "This cleaner is unavailable for the job time.": "Este profissional não está disponível no horário do serviço.",
  "This job changed while you were assigning it. Review the refreshed crew slots.": "Este serviço mudou durante a alocação. Revise as posições atualizadas da equipe.",
  "The cleaner could not be assigned. Review the refreshed crew slots and try again.": "Não foi possível alocar o profissional. Revise as posições atualizadas da equipe e tente novamente.",
  "The assignment could not be confirmed. Review the refreshed crew slots before trying again.": "Não foi possível confirmar a alocação. Revise as posições atualizadas da equipe antes de tentar novamente.",
  "The job could not be cancelled.": "Não foi possível cancelar o serviço.",
  "The job could not be cancelled. Review the refreshed job and try again.": "Não foi possível cancelar o serviço. Revise o serviço atualizado e tente novamente.",
  "The cancellation could not be confirmed. Review the refreshed job before trying again.": "Não foi possível confirmar o cancelamento. Revise o serviço atualizado antes de tentar novamente.",
  "A new invite code could not be generated. Please try again.": "Não foi possível gerar um novo código de convite. Tente novamente.",
  "Choose a PNG, JPEG, or WebP image.": "Selecione uma imagem PNG, JPEG ou WebP.",
  "We could not compress that logo below 400 KB.": "Não foi possível compactar esse logotipo para menos de 400 KB.",
  "Choose a compressed WebP logo under 400 KB.": "Selecione um logotipo WebP compactado com menos de 400 KB.",
  "The save could not be confirmed. Reload before trying again to reconcile your company details and logo.": "Não foi possível confirmar o salvamento. Recarregue a página antes de tentar novamente para verificar os dados e o logotipo da empresa.",
  "The logo upload could not be prepared. Your company details were not changed.": "Não foi possível preparar o envio do logotipo. Os dados da empresa não foram alterados.",
  "A previous pending logo could not be cleared. Your company details were not changed.": "Não foi possível remover um logotipo pendente anterior. Os dados da empresa não foram alterados.",
  "The logo could not be uploaded. Your company details were not changed.": "Não foi possível enviar o logotipo. Os dados da empresa não foram alterados.",
};

export function localiseUserMessage(
  message: string | null | undefined,
  locale: AppLocale,
) {
  if (!message || locale === "en-AU") return message;
  return ptBrMessages[message] ?? "Não foi possível concluir esta ação. Tente novamente.";
}

export function localiseFieldErrors<TFields extends Record<string, string | undefined>>(
  fieldErrors: TFields,
  locale: AppLocale,
) {
  return Object.fromEntries(
    Object.entries(fieldErrors).map(([field, message]) => [
      field,
      localiseUserMessage(message, locale),
    ]),
  ) as TFields;
}

export function localiseMutationResult<
  TResult extends {
    fieldErrors: Record<string, string>;
    formError: string | null;
  },
>(result: TResult, locale: AppLocale): TResult {
  return {
    ...result,
    fieldErrors: localiseFieldErrors(result.fieldErrors, locale),
    formError: localiseUserMessage(result.formError, locale) ?? null,
  };
}
