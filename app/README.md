# AG Assist App

Centro de controle da Lida em React/Vite, usado na web e no projeto Android Capacitor. O React consome a API Express existente; o portal `/area-do-cliente` continua disponível.

## Desenvolvimento

Na pasta `CampoAI`, execute `npm run dev` para a API. Na pasta `CampoAI/app`, execute `npm install` e `npm run dev`. O Vite abre em `http://localhost:5173` e encaminha `/api` para `http://127.0.0.1:3000`. A porta da API pode ser ajustada em `vite.config.ts`.

## Build web

Execute `npm run build` em `CampoAI/app`. O Express serve o resultado em `/app/`. O build web usa a mesma origem da API e URLs relativas para os assets.

Para um ambiente de deploy limpo, `npm run build` na pasta `CampoAI` instala as dependências do app a partir do lockfile e produz `app/dist`. Esse comando deve fazer parte do build da hospedagem antes de `npm start`.

## Android com Capacitor

O projeto nativo está em `app/android`, com identificador provisório `com.agassist.app`. Use Node.js 22 ou superior, Android Studio e Android SDK instalados. Na pasta `CampoAI/app`:

```sh
npm install
npm run sync:android
npm run open:android
```

`sync:android` gera o React em modo nativo e copia os assets para o projeto Android. Execute esse comando depois de alterar o frontend antes de compilar no Android Studio. O build nativo lê `app/.env.native`, que contém somente a URL pública HTTPS da API; nunca coloque segredos em variáveis `VITE_*`. O build web (`npm run build`) continua independente e com API relativa.

No Windows, `cd android` e `./gradlew.bat assembleDebug` gera um APK de teste em `android/app/build/outputs/apk/debug/app-debug.apk`. Para instalar diretamente, conecte um aparelho com depuração USB ou inicie um emulador no Android Studio.

Nesta primeira versão o app precisa de conexão. Login, cadastro, confirmação de e-mail, links externos e WhatsApp ainda precisam ser testados em aparelho ou emulador antes de distribuir APK. O identificador Android precisa ser definido definitivamente antes de publicar na loja.
