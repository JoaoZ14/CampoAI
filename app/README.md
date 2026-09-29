# AG Assist App

Primeira versão web do centro de controle da Lida. O React consome a API Express existente; o portal `/area-do-cliente` continua disponível.

## Desenvolvimento

Na pasta `CampoAI`, execute `npm run dev` para a API. Na pasta `CampoAI/app`, execute `npm install` e `npm run dev`. O Vite abre em `http://localhost:5173` e encaminha `/api` para `http://127.0.0.1:3000`. A porta da API pode ser ajustada em `vite.config.ts`.

## Build web

Execute `npm run build` em `CampoAI/app`. O Express serve o resultado em `/app/`. O frontend usa URLs relativas para os assets, compatíveis com o futuro pacote Capacitor.

Para um ambiente de deploy limpo, `npm run build` na pasta `CampoAI` instala as dependências do app a partir do lockfile e produz `app/dist`. Esse comando deve fazer parte do build da hospedagem antes de `npm start`.

## Estado do Capacitor

O app ainda não contém os projetos Android/iOS. Antes de empacotar, configure `VITE_API_BASE_URL` para a API HTTPS, valide login e retorno dos links externos no WebView, e então adicione Capacitor ao mesmo projeto. A primeira versão exige conexão para ler e gravar.
