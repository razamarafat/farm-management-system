import { motion } from 'framer-motion';
import { FarmList } from '@/components/farms/FarmList';

const AdminFarmsPage = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <FarmList />
    </motion.div>
  );
};

export default AdminFarmsPage;
