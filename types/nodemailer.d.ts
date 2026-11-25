declare module "nodemailer" {
  export interface Transporter {
    sendMail(message: {
      from: string;
      to: string;
      subject: string;
      text: string;
      html?: string;
    }): Promise<unknown>;
    close(): void;
  }

  interface TransportOptions {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string };
    connectionTimeout: number;
    greetingTimeout: number;
    socketTimeout: number;
  }

  const nodemailer: {
    createTransport(options: TransportOptions): Transporter;
  };

  export default nodemailer;
}
