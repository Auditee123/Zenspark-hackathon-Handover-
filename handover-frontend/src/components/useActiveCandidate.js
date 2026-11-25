import { useParams } from 'react-router-dom';
import { usePipeline } from '../state/pipeline.jsx';

// The candidate in the URL, or the most recently added real candidate.
export function useActiveCandidate() {
  const { id } = useParams();
  const { candidates } = usePipeline();
  return candidates.find((c) => c.id === id) || candidates.find((c) => !c.sample) || null;
}
