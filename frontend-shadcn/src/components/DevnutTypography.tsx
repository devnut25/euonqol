import clsx from 'clsx';

interface TitleProps {
  title: string;
  className?: string;
}

const Title = ({ title, className = '' }: TitleProps) => {
  return (
    <h1 className={clsx('font-semibold text-black text-2xl lg:text-4xl', className)}>{title}</h1>
  );
};

const SubTitle = ({ title, className = '' }: TitleProps) => {
  return <h1 className={clsx('font-semibold text-black text-lg', className)}>{title}</h1>;
};

const Paragraph = ({ title, className = '' }: TitleProps) => {
  return <p className={clsx('text-sm font-semibold text-primary', className)}>{title}</p>;
};

const Description = ({ title, className = '' }: TitleProps) => {
  return <p className={clsx('text-sm text-muted-foreground', className)}>{title}</p>;
};

const DevnutTypography = { Title, SubTitle, Paragraph, Description };

export default DevnutTypography;
