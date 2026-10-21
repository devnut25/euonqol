import DevnutSection from '@/components/DevnutSection';
import { ItemLoader } from '@/components/ItemLoader';
import { useAuth } from '@/hooks/useAuth';
import { UserForm } from './users/form';

export const ProfileContent = () => {
  const { user } = useAuth();

  return (
    <DevnutSection.Grid>
      <h1 className="font-semibold text-black text-2xl lg:text-4xl">Profile</h1>
      <ItemLoader url={`/users/${user?.sub}`}>
        {(item) => <UserForm readonly initialValues={item} />}
      </ItemLoader>
    </DevnutSection.Grid>
  );
};
