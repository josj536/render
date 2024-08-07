const puppeteer = require("puppeteer");
require("dotenv").config();

const scrapeLogic = async (req, res) => {
    const placa = req.headers['x-placa'];

    if (!placa) {
        return res.status(400).send('Placa es requerida en los encabezados');
    }

    try {
        const browser = await puppeteer.launch({
            args: [
                "--disable-setuid-sandbox",
                "--no-sandbox",
                "--single-process",
                "--no-zygote",
            ],
            executablePath:
                process.env.NODE_ENV === "production"
                    ? process.env.PUPPETEER_EXECUTABLE_PATH
                    : puppeteer.executablePath(),
        });
        const page = await browser.newPage();

        await page.setViewport({ width: 1200, height: 800 });
        console.log('Navegador abierto, navegando a la URL...');
        await page.goto('https://www.suraenlinea.com/soat/sura/seguro-obligatorio', { waitUntil: 'networkidle2', timeout: 40000 });

        try {
            console.log('Esperando al modal...');
            await page.waitForSelector('.sura-modal-button', { timeout: 5000 });
            console.log('Modal encontrado, cerrándolo...');
            await page.click('.sura-modal-button');
        } catch (error) {
            console.log('No se encontró el modal o no se pudo cerrar.');
        }

        console.log('Esperando el campo de entrada para la placa...');
        await page.waitForSelector('#vehiculo-placa input', { visible: true, timeout: 10000 });

        console.log('Ingresando la placa en el campo...');
        await page.evaluate((placa) => {
            const input = document.querySelector('#vehiculo-placa input');
            if (input) {
                input.value = placa;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, placa);

        // Espera adicional para asegurar que el botón se habilite
        await page.waitForTimeout(5000); // Espera de 5 segundos

        console.log('Esperando el botón de búsqueda...');
        await page.waitForSelector('#id-boton-cotizar', { visible: true, timeout: 1000 });

        console.log('Verificando si el botón de búsqueda está habilitado...');
        const isButtonEnabled = await page.evaluate(() => {
            const button = document.querySelector('#id-boton-cotizar');
            return button && !button.disabled;
        });

        if (isButtonEnabled) {
            console.log('Botón de búsqueda habilitado, haciendo clic...');
            const buttonPosition = await page.evaluate(() => {
                const button = document.querySelector('#id-boton-cotizar');
                const rect = button.getBoundingClientRect();
                return { x: rect.left + window.scrollX + (rect.width / 2), y: rect.top + window.scrollY + (rect.height / 2) };
            });

            await page.mouse.click(buttonPosition.x, buttonPosition.y);
        } else {
            console.log('El botón de búsqueda está deshabilitado.');
            await browser.close();
            return res.status(500).send('El botón de búsqueda está deshabilitado.');
        }

        console.log('Esperando los resultados...');
        await page.waitForSelector('.vehiculo-summary__value', { visible: false, timeout: 10000 });
        console.log('Extrayendo resultados...');
        const resultados = await page.evaluate(() => {
            const info = {};

            const marcaElement = document.querySelector('#vehiculo-detail-marca');
            info.marca = marcaElement ? marcaElement.innerText : 'No se encontró la marca';

            return info;
        });

        const resultadosConPlaca = { placa, ...resultados };

        console.log('Resultados del scraping:', resultadosConPlaca);
        await browser.close();
        res.json(resultadosConPlaca);

    } catch (error) {
        console.error('Error en el scraping:', error);
        res.status(500).send(`Error en el scraping: ${error.message}`);
    }
};

module.exports = { scrapeLogic };

