import { motion } from 'framer-motion';
import { UserList } from '@/components/users/UserList';

const AdminUsersPage = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <UserList />
    </motion.div>
  );
};

export default AdminUsersPage;
