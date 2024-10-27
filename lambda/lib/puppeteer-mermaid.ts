import puppeteer from 'puppeteer-core';
import chromium from "@sparticuz/chromium";
import logger from './logger.js';

export async function convertMermaidToImage(mermaidSyntax: string){
  logger.info(`Input: ${mermaidSyntax}`);
  chromium.setHeadlessMode = true;
  chromium.setGraphicsMode = false;
  try{
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath('/opt/nodejs/node_modules/@sparticuz/chromium/bin'),
      headless: chromium.headless,
    });
    const page = await browser.newPage();
    await page.setContent(`
      <html>
        <head>
          <script src="https://cdn.jsdelivr.net/npm/mermaid@11.3.0/dist/mermaid.min.js"></script>
          <script>
            mermaid.initialize({ startOnLoad: true });
          </script>
        </head>
        <body>
          <pre class="mermaid">
            ${mermaidSyntax}
          </pre>
        </body>
      </html>
    `);
    const mermaidContent = await page.$('.mermaid');
    const png = await mermaidContent?.screenshot({type: 'png'});
    return png;
  }catch(e){
    logger.error(JSON.stringify(e));
    throw new Error(JSON.stringify(e))
  }
}