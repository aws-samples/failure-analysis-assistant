import puppeteer from 'puppeteer-core';
import chromium from "@sparticuz/chromium";

export async function convertMermaidToImage(mermaidSyntax: string){
    chromium.setHeadlessMode = true;
    chromium.setGraphicsMode = false;
    try{
        console.log('browser')
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
    }catch(error){
        console.log(error);
        return undefined;
    }

}