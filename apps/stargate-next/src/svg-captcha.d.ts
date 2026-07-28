declare module "svg-captcha" {
  type CaptchaOptions = {
    background?: string;
    charPreset?: string;
    color?: boolean;
    fontSize?: number;
    height?: number;
    ignoreChars?: string;
    noise?: number;
    size?: number;
    width?: number;
  };

  type Captcha = {
    data: string;
    text: string;
  };

  const svgCaptcha: {
    create(options?: CaptchaOptions): Captcha;
  };

  export default svgCaptcha;
}
