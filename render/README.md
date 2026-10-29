# Deploy no Render: PostgreSQL + AWS S3

[Iniciar o deploy no Render](https://render.com/deploy?repo=https://github.com/temoteotembeelectromatic/electomatic)

O `render.yaml` cria um serviço Node pago e uma base de dados PostgreSQL paga na região Frankfurt. Consulte os valores apresentados pelo Render antes de confirmar a criação. O S3 é um bucket AWS já existente, facturado separadamente. Não é necessário disco persistente no serviço web.

## Variáveis de ambiente

O Blueprint pede os valores abaixo. Preencha-os directamente no Render; não os guarde no GitHub nem os envie em mensagens.

| Variável | Valor |
| --- | --- |
| `ADMIN_EMAIL` | Email do primeiro administrador |
| `S3_BUCKET` | Nome do bucket AWS existente |
| `AWS_REGION` | Região desse bucket, por exemplo `af-south-1` se essa for a região real |
| `AWS_ACCESS_KEY_ID` | Chave IAM com acesso apenas ao prefixo utilizado |
| `AWS_SECRET_ACCESS_KEY` | Segredo dessa chave IAM |
| `DATABASE_URL` | Preenchida automaticamente a partir da nova base de dados Render |
| `BOOTSTRAP_TOKEN` | Gerado automaticamente pelo Render; usado uma única vez para criar o administrador |
| `S3_PREFIX` | `electomatic/` por defeito |
| `RENDER_EXTERNAL_URL` | Fornecida automaticamente pelo Render |

Se utilizar domínio personalizado, defina `APP_URL=https://seu-dominio` e use esse endereço para aceder à aplicação. O endereço configurado também determina a origem permitida para formulários. `DATABASE_SSL=true` activa TLS com validação de certificado para ligações externas; `DATABASE_CA` permite fornecer uma CA própria. Não desactive a validação de certificados. O Blueprint utiliza a ligação interna do Render e bloqueia ligações públicas à base de dados.

Para um bucket com SSE-KMS obrigatório, defina `S3_SSE=aws:kms` e `S3_KMS_KEY_ID`, e conceda as permissões KMS necessárias. `AWS_SESSION_TOKEN` também é suportado pelo SDK, mas credenciais temporárias têm de ser renovadas antes de expirar.

## Permissões S3

Mantenha o bloqueio de acesso público do bucket activado. A aplicação nunca cria ACLs públicas e nunca expõe chaves AWS ao browser. O servidor verifica a sessão e a permissão sobre o pedido antes de descarregar anexos.

Exemplo de política IAM, substituindo `NOME-DO-BUCKET` pelo nome real:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
    "Resource": "arn:aws:s3:::NOME-DO-BUCKET/electomatic/*"
  }]
}
```

`DeleteObject` é usado apenas para limpar uploads que não foram associados a um pedido. A interface não permite apagar provas registadas. Active versionamento e configure retenção/backups de acordo com as necessidades da empresa. O browser não acede directamente ao S3, pelo que a aplicação não precisa de CORS no bucket.

## Primeiro acesso e equipa

1. Abra a URL publicada, escolha **Primeiro acesso do administrador** e use `ADMIN_EMAIL`, o valor de `BOOTSTRAP_TOKEN` mostrado nas variáveis do Render e uma palavra-passe de pelo menos 12 caracteres.
2. Configure a empresa e o NUIT. Só a conta designada pode fazer a configuração inicial; não existe registo público.
3. Em **Equipa**, adicione o nome, email e função de cada pessoa. Clique em **Gerar convite** e partilhe esse link privado directamente com o destinatário. Não é enviado email automaticamente.
4. Cada convite expira em 48 horas e pode ser utilizado uma vez. Gerar outro substitui o anterior. Usar um convite para uma conta existente redefine a palavra-passe e termina as suas sessões anteriores.

As sessões duram 12 horas e usam cookies HttpOnly, Secure em produção e SameSite. As palavras-passe são protegidas com scrypt; tokens de sessão e convite são guardados apenas como hashes. O serviço rejeita pedidos de alteração com origem diferente da configurada. A limitação de tentativas de acesso fica em PostgreSQL.

## Execução e verificação

```sh
npm ci --include=dev
npm run build:render
npm run test:render
npm run start:render
```

Defina as variáveis antes de iniciar. O servidor escuta em `0.0.0.0:$PORT`. `/healthz` verifica a ligação PostgreSQL. As migrações são aplicadas no arranque sob lock e com checksum; nunca edite uma migração já aplicada, acrescente outra. As migrações não criam registos de demonstração.

Os testes usam o motor PostgreSQL PGlite e um cliente S3 simulado. Validam SQL, transacções, regras de aprovação, auditoria, autenticação e parâmetros S3. Não provam que as credenciais e políticas do seu bucket funcionam; após configurar o ambiente, teste um upload e download de PDF na aplicação.

O processo web não mantém dados persistentes no disco. Registos, contas e sessões ficam em PostgreSQL; anexos ficam no S3. Este deploy usa uma nova base de dados: **não migra automaticamente registos ou anexos da versão Sites**. A versão Sites permanece independente. Se já houver dados reais nela, planeie a exportação/importação antes de passar a usar apenas o Render.

Referências: [Render Blueprints](https://render.com/docs/blueprint-spec), [AWS S3 SDK](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html).

## Função Financeiro

O Administrador aprova ou rejeita pedidos; não pode aprovar o seu próprio pedido. Financeiro e Administrador podem registar pagamentos apenas após aprovação do Administrador. Financeiro consulta pedidos e comprovativos da empresa, mas não gere a equipa, cria projectos ou encerra contas. Gestor mantém a gestão de projectos e o encerramento de contas, sem aprovar ou registar pagamentos.

A migração `002_finance_role.sql` acrescenta a função sem apagar dados. Pedidos antigos aprovados por Gestores requerem validação do Administrador antes do pagamento. Pagamentos e contas já encerradas são preservados.

## Entradas e saídas

Admin e Financeiro têm acesso a uma página de tesouraria com créditos, débitos, saldo, filtros e CSV. Os lançamentos manuais exigem data, descrição, origem/beneficiário, método, referência e comprovativo PDF/JPEG/PNG até 10 MB. A associação ao projecto é opcional. Cada registo conserva autor, data de criação e hash do comprovativo; não existem operações de edição ou eliminação. O mesmo envio repetido não cria outro lançamento.

Pagamentos de pedidos com estado Pago ou Encerrado são incluídos como saídas automaticamente, uma vez por pedido, incluindo pagamentos anteriores a esta versão. Aprovar um pedido não movimenta o saldo. Não lance manualmente esses pagamentos. O saldo representa os movimentos registados ou filtrados, não uma consulta de contas bancárias. Créditos significam entradas de fundos; não há cálculo de juros ou gestão de empréstimos.

A migração `003_cash_movements.sql` acrescenta uma tabela e índices sem alterar os pedidos existentes. O saldo pode ser negativo se existirem pagamentos anteriores sem entradas correspondentes. Registe apenas entradas reais; os registos não são preenchidos automaticamente.

## Links de redefinição e palavra-passe temporária

Em Equipa, o Admin pode gerar um **Link de acesso / redefinição**, copiá-lo e enviá-lo directamente à pessoa. O link é associado ao email, expira em 48 horas e funciona uma única vez; gerar outro invalida o anterior. O programa não envia emails automaticamente.

A opção **Definir palavra-passe** permite ao Admin definir uma palavra-passe temporária para Técnico, Gestor ou Financeiro (incluindo uma conta ainda não activada). Sessões e convites anteriores são invalidados. Após entrar, a pessoa só poderá usar a aplicação depois de escolher uma palavra-passe diferente. A conta do próprio Admin não pode ser redefinida por esta opção; pode utilizar **Alterar palavra-passe** com a sua palavra-passe actual. As alterações ficam auditadas sem gravar as palavras-passe no histórico.

## Diagnóstico de erros

Falhas de S3 e PostgreSQL mostram o serviço, a operação quando disponível, o código do erro e uma referência única. Nos logs do Render, pesquise essa referência para encontrar a mensagem técnica. O programa não devolve credenciais, URLs de ligação ou conteúdo das linhas SQL ao browser. Erros de validação continuam a indicar directamente o campo a corrigir.
