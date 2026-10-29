const explanations = {
  AccessDenied: 'O S3 recusou o acesso. Verifique as permissões IAM e a política do bucket para esta operação.',
  InvalidAccessKeyId: 'A chave AWS_ACCESS_KEY_ID não é reconhecida pela AWS.',
  SignatureDoesNotMatch: 'A assinatura AWS não corresponde. Verifique AWS_SECRET_ACCESS_KEY e AWS_REGION.',
  CredentialsProviderError: 'As credenciais AWS não foram encontradas. Configure AWS_ACCESS_KEY_ID e AWS_SECRET_ACCESS_KEY no Render.',
  NoSuchBucket: 'O bucket S3 configurado não existe. Verifique S3_BUCKET.',
  PermanentRedirect: 'O endereço ou região do bucket está incorrecto. Verifique AWS_REGION.',
  AuthorizationHeaderMalformed: 'A região da autenticação AWS não corresponde à região esperada pelo S3.',
  ExpiredToken: 'As credenciais temporárias AWS expiraram. Renove-as no Render.',
  InvalidToken: 'O token de sessão AWS é inválido. Verifique AWS_SESSION_TOKEN.',
  InvalidRequest: 'O S3 rejeitou a configuração do pedido. Verifique as regras de encriptação e a política do bucket.',
  KMSAccessDeniedException: 'A chave KMS recusou o acesso. Verifique as permissões de encriptação do bucket.',
  '42P01': 'A tabela necessária não existe na base de dados. Verifique a execução das migrações no deploy.',
  '42703': 'Uma coluna necessária não existe na base de dados. Verifique a execução das migrações no deploy.',
  '23505': 'Já existe um registo com o mesmo identificador ou valor único.',
  '23503': 'O registo associado não existe ou já não está disponível.',
  '23514': 'O valor não respeita uma regra da base de dados.',
  '23502': 'Falta um campo obrigatório na base de dados.',
  '22003': 'O valor excede o limite numérico da base de dados.',
  '28P01': 'A autenticação PostgreSQL falhou. Verifique DATABASE_URL.',
  '42501': 'O utilizador PostgreSQL não tem permissão para esta operação.',
  '53300': 'O limite de ligações PostgreSQL foi atingido.',
  ECONNREFUSED: 'A ligação ao serviço foi recusada.',
  ENOTFOUND: 'Não foi possível resolver o endereço do serviço.',
  ETIMEDOUT: 'A ligação ao serviço excedeu o tempo limite.',
  TimeoutError: 'O serviço não respondeu dentro do tempo limite.'
};
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,100}$/.test(value) ? value : undefined;
function redact(message) {
  let text = String(message || '').slice(0, 4000);
  // Never serialize error objects: SDK requests and PG details can contain credentials or row data.
  if (typeof process !== 'undefined') for (const [key,value] of Object.entries(process.env || {})) {
    if (/(PASSWORD|SECRET|TOKEN|ACCESS_KEY|DATABASE_URL|DATABASE_CA)/i.test(key) && value && value.length >= 4) text = text.split(value).join('[REDACTED]');
  }
  return text.replace(/\b(?:postgres(?:ql)?|https?):\/\/[^\s]+/gi, '[URL REDACTED]')
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '[AWS KEY REDACTED]')
    .replace(/((?:password|secret|token|authorization|access[_-]?key)\s*[:=]\s*)(?:Bearer\s+)?[^\s,;]+/gi, '$1[REDACTED]');
}
export function reportError(error) {
  const e = error || {};
  // Application validation and authorization errors already have actionable, controlled messages.
  if (Number.isInteger(e.status) && e.status >= 400 && e.status < 500) return { status:e.status, body:{error:e.message} };
  const diagnosticId = crypto.randomUUID();
  const code = identifier(e.code) || identifier(e.name) || 'UnknownError';
  const service = e.service === 'S3' ? 'S3' : /^[0-9A-Z]{5}$/.test(code) ? 'PostgreSQL' : 'Servidor';
  const operation = identifier(e.operation);
  const message = explanations[code] || 'Falha interna. Consulte o detalhe nos logs do Render usando a referência abaixo.';
  const fields = [identifier(e.table) && `tabela=${e.table}`, identifier(e.column) && `coluna=${e.column}`, identifier(e.constraint) && `regra=${e.constraint}`].filter(Boolean).join(', ');
  const providerRequestId = identifier(e.$metadata?.requestId);
  const body = {error:`${service}${operation?' / '+operation:''}: ${message} Código: ${code}.${fields?' '+fields+'.':''} Referência: ${diagnosticId}`,code,diagnosticId,...(providerRequestId?{providerRequestId}:{})};
  console.error(JSON.stringify({event:'application_error',diagnosticId,service,operation,code,message:redact(e.message),fields,providerRequestId,httpStatus:e.$metadata?.httpStatusCode}));
  return {status:500,body};
}
