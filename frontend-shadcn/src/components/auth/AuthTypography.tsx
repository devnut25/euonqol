import clsx from "clsx";

interface TitleProps {
  title: string;
  className?: string;
}

const Title = ({ title, className = "" }: TitleProps) => {
  return (
    <h1
      className={clsx(
        "font-semibold text-primary mb-1 text-4xl lg:text-5xl",
        className
      )}
    >
      {title}
    </h1>
  );
};

interface SubtitleProps {
  subtitle: string;
  className?: string;
}

const Subtitle = ({ subtitle, className = "" }: SubtitleProps) => {
  return (
    <div
      className={clsx(
        "text-primary font-semibold mt-0 mb-2 text-xl lg:text-2xl",
        className
      )}
    >
      {subtitle}
    </div>
  );
};

const AuthTypography = { Title, Subtitle };

export default AuthTypography;
