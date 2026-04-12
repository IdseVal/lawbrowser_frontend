"use client";

interface EuropeMapProps {
  onSelectCountry: (country: string) => void;
}

/**
 * Simplified SVG map of Western Europe.
 * Only the Netherlands is clickable (highlighted).
 */
export default function EuropeMap({ onSelectCountry }: EuropeMapProps) {
  return (
    <div className="map-container mt-4">
      <p className="map-label">
        <i className="fa-solid fa-earth-europe me-2" />
        Click a jurisdiction to browse its legal structure
      </p>
      <svg viewBox="0 0 600 500" xmlns="http://www.w3.org/2000/svg">
        {/* Great Britain */}
        <path
          className="country"
          d="M150,120 L170,100 L185,105 L195,130 L190,170 L180,200 L165,210 L155,195 L145,175 L140,150 Z"
        />
        {/* Ireland */}
        <path
          className="country"
          d="M110,140 L130,130 L140,145 L138,170 L125,185 L112,175 L108,155 Z"
        />
        {/* France */}
        <path
          className="country"
          d="M200,250 L240,230 L280,235 L310,260 L320,300 L300,340 L270,360 L230,350 L200,330 L185,300 L190,270 Z"
        />
        {/* Belgium */}
        <path
          className="country"
          d="M245,215 L275,210 L285,225 L270,235 L245,230 Z"
        />
        {/* Luxembourg */}
        <path
          className="country"
          d="M278,228 L290,225 L292,238 L280,240 Z"
        />
        {/* Germany */}
        <path
          className="country"
          d="M290,150 L340,140 L370,155 L385,190 L380,230 L360,260 L320,265 L295,245 L285,225 L275,205 L280,170 Z"
        />
        {/* Denmark */}
        <path
          className="country"
          d="M290,100 L310,95 L315,115 L305,130 L290,125 Z"
        />
        {/* Netherlands - clickable */}
        <path
          className="country clickable"
          d="M250,175 L275,165 L282,175 L280,195 L270,210 L250,210 L242,195 Z"
          onClick={() => onSelectCountry("https://legal-ontology.org/id/Nederlands_recht")}
        >
          <title>Nederland</title>
        </path>
        {/* Switzerland */}
        <path
          className="country"
          d="M290,270 L325,265 L335,280 L320,295 L295,290 Z"
        />
        {/* Austria */}
        <path
          className="country"
          d="M340,265 L385,258 L400,270 L390,285 L350,285 L335,280 Z"
        />
        {/* Spain */}
        <path
          className="country"
          d="M140,350 L200,330 L230,350 L230,400 L200,420 L160,415 L130,390 Z"
        />
        {/* Portugal */}
        <path
          className="country"
          d="M115,360 L135,350 L138,390 L125,410 L112,395 Z"
        />
        {/* Italy */}
        <path
          className="country"
          d="M310,300 L330,295 L340,320 L350,370 L340,400 L330,390 L320,350 L305,320 Z"
        />

        {/* Label for Netherlands */}
        <text
          x="260"
          y="200"
          textAnchor="middle"
          fontSize="10"
          fill="#1a3a5c"
          fontWeight="bold"
          pointerEvents="none"
        >
          NL
        </text>
      </svg>
    </div>
  );
}
