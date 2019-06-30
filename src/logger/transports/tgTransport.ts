import Transport from 'winston-transport';
import FormData from 'form-data';
import fetch from 'node-fetch';
import fs from 'fs';

interface TelegramTransportOptions extends Transport.TransportStreamOptions {
  token: string
  chatId: string
  pathToImage: string
}

export class TelegramTransport extends Transport {

  private token: string

  private chatId: string

  private pathToImage: string

  constructor(options: TelegramTransportOptions) {
    super(options);

    this.token = options.token;
    this.chatId = options.chatId;
    this.pathToImage = options.pathToImage;
  }

  private async sendText(message: string) {
    const response = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: this.chatId,
        text: `\`\`\`${message}\`\`\``,
        parse_mode: 'Markdown',
        disable_notification: true,
      }),
    });

    if (response.status !== 200) {
      const text = await response.text();
      setImmediate(() => this.emit('error', `${response.status} ${text}`));
    }
  }

  private async sendImage() {
    const imageStream = fs.createReadStream(this.pathToImage);

    const formData = new FormData();
    formData.append('chat_id', this.chatId);
    formData.append('photo', imageStream);
    formData.append('disable_notification', 'true');
    const formHeaders = formData.getHeaders();

    const response = await fetch(`https://api.telegram.org/bot${this.token}/sendPhoto`, {
      method: 'POST',
      headers: formHeaders,
      body: formData,
    });

    if (response.status !== 200) {
      const text = await response.text();
      setImmediate(() => this.emit('error', `${response.status} ${text}`));
    }

    imageStream.close();
  }

  log(info: any, callback: () => void): any {
    setImmediate(() => this.emit('logged', info));

    this.sendText(info[Symbol.for('message')])
      .then(() => {
        if (fs.existsSync(this.pathToImage)) {
          return this.sendImage();
        }
        return;
      })
      .then(() => callback())
      .catch(error => console.error(error));
  }
}
