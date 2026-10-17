export interface AuthorProfile {
  name: string;
  role: string;
  credentials: string;
  bio: string;
  image: string;
  url: string;
  sameAs: string[];
  links: { label: string; url: string }[];
  knowsAbout: string[];
}

export const authorProfiles: Record<string, AuthorProfile> = {
  'Juliano Lima': {
    name: 'Juliano Lima',
    role: 'Musicoterapeuta (ABMT 182-PR), escritor e fundador do TerapeutaAI Hub.',
    credentials: 'Administrador, pós-graduado em ABA e TEA e coautor do livro Conexão Autista.',
    bio: 'Atua desde 2019 com saúde mental, neurodesenvolvimento, TDAH e tecnologia aplicada à rotina clínica. Escreve sobre gestão, ética, carreira e inovação para profissionais da saúde.',
    image: '/images/foto-rosto-juliano-lima.webp',
    url: 'https://blog.terapeutaai.com.br/autores/juliano-lima/',
    sameAs: ['https://www.linkedin.com/in/julianolimamt/', 'https://www.instagram.com/julianolima.mt/', 'https://terapeutaai.com.br'],
    links: [
      { label: 'Instagram', url: 'https://www.instagram.com/julianolima.mt/' },
      { label: 'LinkedIn', url: 'https://www.linkedin.com/in/julianolimamt/' },
      { label: 'TerapeutaAI Hub', url: 'https://terapeutaai.com.br' }
    ],
    knowsAbout: ['Musicoterapia', 'ABA', 'TEA', 'TDAH', 'Saúde mental', 'Neurodesenvolvimento', 'Conexão Autista', 'TerapeutaAI Hub', 'Tecnologia para profissionais da saúde']
  },
  'Natassia Pina': {
    name: 'Natassia Pina',
    role: 'Musicoterapeuta, neuropsicopedagoga e autora do Blog TerapeutaAI.',
    credentials: 'Graduanda em Terapia Ocupacional.',
    bio: 'Sua participação no blog é voltada à rotina terapêutica, à comunicação com famílias e ao trabalho em equipes multidisciplinares.',
    image: '/images/foto-natassia-pina.webp',
    url: 'https://blog.terapeutaai.com.br/autores/natassia-pina/',
    sameAs: [],
    links: [],
    knowsAbout: ['Musicoterapia', 'Neuropsicopedagogia', 'Rotina terapêutica', 'Comunicação com famílias', 'Equipes multidisciplinares']
  }
};
