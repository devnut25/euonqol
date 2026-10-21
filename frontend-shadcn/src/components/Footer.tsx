import React from 'react';

const Footer: React.FC = () => (
  <footer className="w-full bg-gray-100 text-center py-4 mt-auto border-t text-sm text-gray-600">
    © {new Date().getFullYear()} EUonQoL Survey Hub.
  </footer>
);

export default Footer;
